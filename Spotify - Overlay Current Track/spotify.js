const desiredAnimationTime = 6.144;
const desiredWidth = 551.53 - 352.6;
let trackCoverElement, trackNameElement, trackArtistElement, trackNameViewportElement, trackRuntimeElement, trackLengthElement, trackPlaybackBarElement;
let clientId, clientSecret;
let normalRate = 500, currentRate = normalRate, idleRate = 2000, tickRate = 250;
let elapsedTimeSinceAppFunctionCall = currentRate;
let timeWindowForRefreshToken = 60000; // Attempt refresh 60s before expiration.
let isAppBusy = false;
let currentTrackLength;
let appIntervalID;

const tokenEndpoint = "https://accounts.spotify.com/api/token";

const getFromSEStorage = async (value) => {
  let returnVal = null;
  await SE_API.store.get(value).then((data) => {
    returnVal = data.value;
  }, (rejected) => {
    console.log(rejected);
  }).catch((error) => {
    console.log(error);
  });
  return returnVal;
}

// Data structure that manages the current active token, caching it in SE_API
const currentToken = {
  access_token: null,
  refresh_token: null,
  expires_in: null,
  expires: null,

  save: function (response) {
    const { access_token, refresh_token, expires_in } = response;
    // check if response provided null for tokens
    if (access_token) {
      SE_API.store.set("access_token", access_token);
      this.access_token = access_token;
    }

    if (refresh_token) {
      SE_API.store.set("refresh_token", refresh_token);
      this.refresh_token = refresh_token;
    }

    if (expires_in) {
      SE_API.store.set("expires_in", expires_in);
      this.expires_in = expires_in;

      const now = new Date();
      const expires = new Date(now.getTime() + (expires_in * 1000));
      SE_API.store.set("expires", expires);
      this.expires = expires;
    }
  },
  retrieve: async function () {
    await getFromSEStorage("access_token").then((data) => {
      this.access_token = data;
    });
    await getFromSEStorage("refresh_token").then((data) => {
      this.refresh_token = data;
    });
    await getFromSEStorage("expires_in").then((data) => {
      this.expires_in = data;
    });
    await getFromSEStorage("expires").then((data) => {
      this.expires = data;
    });

    return this;
  }
};
//#region UI
// Used for adding delay at end of animation. Delay at start is done using animation-delay property(css)

const animationStartAndEndDelay = 3; // delay time in seconds
const StartDelayTrackNameAnimation = () => {
  trackNameAnimation.pause();
  setTimeout(() => { trackNameAnimation.play(); }, (animationStartAndEndDelay) * 1000);
}
const EndDelayTrackNameAnimation = () => {
  setTimeout(() => { trackNameAnimation.cancel();}, animationStartAndEndDelay * 1000);
}
const StartDelayTrackArtistAnimation = () => {
  trackArtistAnimation.pause();
  setTimeout(() => { trackArtistAnimation.play(); }, animationStartAndEndDelay * 1000);
}
const EndDelayTrackArtistAnimation = () => {
  setTimeout(() => { trackArtistAnimation.cancel(); }, animationStartAndEndDelay * 1000);
}

const InitializeUI = () => {
  trackArtistElement = document.getElementById("track-artist");
  trackNameElement = document.getElementById("track-name");
  trackNameViewportElement = document.getElementById("track-name-panel");
  trackRuntimeElement = document.getElementById("track-runtime");
  trackLengthElement = document.getElementById("track-length");
  trackPlaybackBarElement = document.getElementById("track-progress");
  trackCoverElement = document.getElementById("track-cover");

  trackNameAnimation = trackNameElement.getAnimations()[0];
  trackArtistAnimation = trackArtistElement.getAnimations()[0];

  // stops text from moving at start and end to help readers.
  trackNameAnimation.addEventListener("cancel", StartDelayTrackNameAnimation);
  trackNameAnimation.addEventListener("finish", EndDelayTrackNameAnimation);
  trackArtistAnimation.addEventListener("cancel", StartDelayTrackArtistAnimation);
  trackArtistAnimation.addEventListener("finish", EndDelayTrackArtistAnimation);

  UpdateTrackName("Spotify - Display Current Track");
  UpdateTrackArtist("Widget by NB_0B");
}
const UpdateTrackCover = (trackCover) => {
  trackCoverElement.style.background = `url(${trackCover})`;
}
const UpdateTrackName = (trackName) => {
  trackNameElement.innerText = trackName;

  if (trackNameElement.getBoundingClientRect().width <= trackNameViewportElement.getBoundingClientRect().width) {
    trackNameElement.style.animation = `0s linear 0s 1 normal forwards paused scrollRight`;
    trackNameAnimation.pause();
    return;
  }
  
  let newDelay = (desiredAnimationTime / desiredWidth) * (trackNameElement.getBoundingClientRect().width - trackNameViewportElement.getBoundingClientRect().width);
  trackNameElement.style.animation = `${newDelay}s linear 0s 1 normal forwards running scrollRight`;
  trackNameAnimation.cancel();
}

const UpdateTrackArtist = (trackArtists) => {
  if(typeof trackArtists == "string"){
    trackArtistElement.innerText = trackArtists;
  }
  else if (trackArtists.length > 0) {
    let temp = trackArtists[0].name;
    for (let artist = 1; artist < trackArtists.length; artist++) {
      temp += `, ${trackArtists[artist].name}`;
    }
    trackArtistElement.innerText = temp;
  }
  else {
    trackArtistElement.innerText = "";
  }
  
  // tracknameViewport same size as artistnameViewport
  if (trackArtistElement.getBoundingClientRect().width <= trackNameViewportElement.getBoundingClientRect().width) {
    trackArtistElement.style.animation = `0s linear 0s 1 normal forwards paused scrollRight`;
    trackArtistAnimation.pause();
    return;
  }

  let newDelay =  (desiredAnimationTime / desiredWidth) * (trackArtistElement.getBoundingClientRect().width - trackNameViewportElement.getBoundingClientRect().width);
  trackArtistElement.style.animation = `${newDelay}s linear 0s 1 normal forwards running scrollRight`;
  trackArtistAnimation.cancel();
}

const UpdatePlayback = (runtime, length = -1) => {
  let runtimeDate = new Date(runtime);
  trackRuntimeElement.textContent = runtimeDate.getMinutes() + ":" + ("0" + runtimeDate.getSeconds()).slice(-2);

  // if length exists, change the length
  if (length > 0) {
    currentTrackLength = length;
    let lengthDate = new Date(length);
    trackLengthElement.textContent = lengthDate.getMinutes() + ":" + ("0" + lengthDate.getSeconds()).slice(-2);
  }

  trackPlaybackBarElement.style.width = `${(runtime / currentTrackLength) * 100}%`;
}
//#endregion UI
//#region Spotify API
/*
  https://developer.spotify.com/documentation/web-api/reference/get-the-users-currently-playing-track
  
  Important fields in return data(data = response.json()):
  1. progress_ms:   Progress into the currently playing track or episode. Can be null.
  2. is_playing:    If something is currently playing, return true.
  3. item:          The currently playing track or episode. Can be null.
      1a: TrackObject
          1b. album[].images[0]   The cover art for the album in various sizes, widest first.
          2b. artists[].name:     The artists who performed the track. Each artist object includes a link in href to more detailed information about the artist.
          3b. duration_ms:        The track length in milliseconds.
          4b. name:               The name of the track.
*/
async function getCurrentTrack() {
  const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + currentToken.access_token },
  });

  response.function = "GetCurrentTrack";

  // Check if no content found in track player
  if (await SpotifyErrorHandler(response)) {
    return Promise.reject({ status: "get-content-fail" });;
  }

  return await response.json();
}

async function refreshCurrentToken() {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret)
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentToken.refresh_token
    })
  });

  response.function = "RefreshCurrentToken";

  if (await SpotifyErrorHandler(response)) {
    return Promise.reject({ status: "refresh-fail" });
  }

  currentToken.save(await response.json());
  return Promise.resolve({ status: "refresh-success" });
}
//#endregion Spotify API

const pauseAndCall = async (func, wait_Time) => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(func());
    }, wait_Time);
  });
}

// Handles: 204, 304, 400, 401, 404, 429, 500, 502, 503
// return true if error, false if no error
const SpotifyErrorHandler = async (error, func = null) => {
  if(error["status"] == 200){
    return;
  }
  let message = error["status"] ? "(SpotifyErrorHandler) Status: " + error["status"] : "(SpotifyErrorHandler) Status: None Provided";
  message += error["function"] ? "\nCalled from: " + error["function"] : "\nCalled from: None Provided";
  message += error["message"] ? "\nMessage: " + error["message"] : "\nMessage: None Provided";
  console.log(message);

  switch (error["status"]) {
    case 204:
      // set polling to idle since no song is selected in track Player
      currentRate = idleRate;
      return true;
    case 304:
      return true;
    case 400:
      return true;
    case 401:
      return true;
    case 404:
      return true;
    case 429:
      const safetyBuffer = 5;
      const wait_Time = error.headers.get("retry-after"); // retry-after header is time in seconds
      console.log("Rate Limited. Retrying in " + (wait_Time + safetyBuffer) + " seconds.");
      if (func) {
        await pauseAndCall(func, (wait_Time + safetyBuffer) * 1000);
      }
      return true;
    case 500:
      return true;
    case 502:
      return true;
    case 503:
      return true;
    default:
      return false;
  }
}

const InitializeSpotifyAPI = async (fieldData) => {
  clientId = fieldData["spotifyClientID"];
  clientSecret = fieldData["spotifyClientSecretID"];
  currentToken.save(JSON.parse(JSON.stringify(fieldData)));
  await currentToken.retrieve();

  const currentTime = new Date();
  await refreshCurrentToken().then((data) => {
    console.log("(InitializeSpotifyAPI) Refreshed Token");
  }).catch((error) => {
    SpotifyErrorHandler(error, refreshCurrentToken);
    return Promise.reject({ status: "setup-fail", message: "(InitializeSpotifyAPI) Error on Initialization. Could not refresh token." });
  });

  return Promise.resolve({ status: "setup-success", message: "" });
}

const App_Function = async () => {
  // Ensures the program makes calls once every second
  elapsedTimeSinceAppFunctionCall += tickRate;
  if (isAppBusy || (elapsedTimeSinceAppFunctionCall <= currentRate)) {
    return;
  }
 
  isAppBusy = true;

  const currentTime = new Date();
  if (!currentToken.expires || (currentToken.expires - timeWindowForRefreshToken <= currentTime)) {
    await refreshCurrentToken().then((data) => {
      console.log("(App_Function) Refreshed Token");
    }).catch((error) => {
      SpotifyErrorHandler(error, refreshCurrentToken);
      return Promise.reject({ status: "refresh-fail", message: "(App_Function) Error on Refresh Attempt." });
    });
  }

  let content = await getCurrentTrack().catch(e => { console.log(e) });

  // 3. If we have new content: 
  //   - Update UI with content
  //   - TODO: Check if Playback is paused here and handle it
  // contentPromise fulfills true if we have resolved promise or rejected promise, false if gettingContent(true)
  // 4. If track doesnt exist or song isn't playing:
  //   - Slow down polling rate

  // true if content is resolved, false otherwise
  if (content) {
    if(content["item"].name != trackNameElement.textContent){
      UpdateTrackName(content["item"].name);
      UpdateTrackArtist(content["item"].artists);
      UpdateTrackCover(content["item"].album.images[1].url);
    }
    UpdatePlayback(content["progress_ms"], content["item"].duration_ms);

    // If track player is playing a song, linear decrease of interval period by tickRate
    if (currentRate != normalRate) {
      currentRate = Math.max(currentRate - tickRate, normalRate);
    }
  }

  elapsedTimeSinceAppFunctionCall = -1 * tickRate; // Need this to wait the full time, dont set elapsed time to zero
  isAppBusy = false;
}

const AppQuit = () => {
  trackNameAnimation.removeEventListener("cancel", StartDelayTrackNameAnimation);
  trackNameAnimation.removeEventListener("finish", EndDelayTrackNameAnimation);
  trackArtistAnimation.removeEventListener("cancel", StartDelayTrackArtistAnimation);
  trackArtistAnimation.removeEventListener("finish", EndDelayTrackArtistAnimation);
  clearInterval(appIntervalID);
  appIntervalID = null;
}

const Wait = async (wait_Time) => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(console.log("--------------------Widget Started--------------------"));
    }, wait_Time);
  });
}

window.addEventListener('onWidgetLoad', async function (obj) {
  await Wait(3000);
  
  // getting field data from streamlabs
  fieldData = obj.detail.fieldData;

  // Initialization/setup
  InitializeUI();
  await InitializeSpotifyAPI(fieldData).catch(e => { console.log(e); });
  
  // Over engineering so I feel good
  appIntervalID = setInterval(App_Function, tickRate);
});

onbeforeunload = (event) => {
  AppQuit();
};
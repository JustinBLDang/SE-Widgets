const desiredAnimationTime = 6;
const desiredWidth = 538.156;
let trackNameElement, trackArtistElement, trackNameViewportElement, trackRuntimeElement, trackLengthElement, trackPlaybackBarElement;
let clientId, clientSecret;
let normalRate = 1000, currentRate = 1000, idleRate = 2000;
let tickRateForFunctionCalls = 200;
let timeWindowForRefreshToken = 60000;
let isAppBusy = false;
let currentTrackLength;
let appIntervalID;

const getFromSEStorage = (value) => {
  SE_API.store.get(value).then((data) => {
    return data.value;
  }, (rejected) => {
    console.log("Rejected Request: " + rejected);
  }).catch((error) => {
    console.log("Error: " + error);
  }); 
  return null;
}

// Data structure that manages the current active token, caching it in localStorage
const currentToken = {
  get access_token() { return getFromSEStorage("access_token"); },
  get refresh_token() { return getFromSEStorage("refresh_token"); },
  get expires_in() { return getFromSEStorage("refresh_in"); },
  get expires() { return getFromSEStorage("expires"); },

  save: function (response) {
    const { access_token, refresh_token, expires_in } = response;

    SE_API.store.setItem('access_token', access_token);
    if(refresh_token){ 
      SE_API.store.setItem('refresh_token', refresh_token); 
      SE_API.store.setItem('expires_in', expires_in);
    }

    const now = new Date();
    const expiry = new Date(now.getTime() + (expires_in * 1000));
    SE_API.store.setItem('expires', expiry);
  }
};
//#region UI
// Used for adding delay at end of animation. Delay at start is done using animation-delay property(css)
const playTrackNameAnimation = () => {
  setTimeout(() => {trackNameAnimation[0].play();}, 3 * 1000);
}

const playTrackArtistAnimation = () => {
  setTimeout(() => {trackArtistAnimation[0].play();}, 3 * 1000);
}

const InitializeUI = () => {
  trackArtistElement = document.getElementById("track-artist");
  trackNameElement = document.getElementById("track-name");
  trackNameViewportElement = document.getElementById("track-name-panel");
  trackRuntimeElement = document.getElementById("track-runtime");
  trackLengthElement = document.getElementById("track-length");
  trackPlaybackBarElement = document.getElementById("track-progress");

  trackNameAnimation = trackNameElement.getAnimations();
  trackArtistAnimation = trackArtistElement.getAnimations();

  // stops text from moving(animation not paused) at start and end to help readers.
  trackNameElement.addEventListener("animationend", playTrackNameAnimation);
  trackArtistElement.addEventListener("animationend", playTrackArtistAnimation);
}

const UpdateTrackName = (trackName) => {
  trackNameElement.textContent = trackName;

  /*
    NOTE: element.clientWidth seems round to highest integer(on Chrome).
    Want to pause since the animation can lead to jittering with text smaller than viewport
  */
  if(trackNameElement.clientWidth <= trackNameViewportElement.clientWidth){
    trackNameElement.style.animationPlayState = "paused"
    return;
  }

  let currentWidth = trackNameElement.clientWidth;
  let newDelay = desiredAnimationTime * (currentWidth / desiredWidth);  

  trackNameElement.style.animation = `${newDelay}s linear 2s 1 normal forwards scrollRight;`;
}

const UpdateTrackArtist = (trackArtists) => {
  if(trackArtists.length > 0){
    trackArtistElement.textContent = trackArtist[0];
    for(let artist = 1; artist < trackArtists.length; artist++){
      trackArtistElement.textContent += `, ${trackArtists[artist]}`;
    }
  }
  else {
    trackArtistElement.textContent = "";
  }

  // tracknameViewport same size as artistnameViewport
  if(trackArtistElement.clientWidth <= trackNameViewportElement.clientWidth){
    trackArtistElement.style.animationPlayState = "paused"
    return;
  }

  let currentWidth = trackArtistElement.clientWidth;
  let newDelay = desiredAnimationTime * (currentWidth / desiredWidth);

  trackArtistElement.style.animation = `${newDelay}s linear 2s 1 normal forwards scrollRight;`;
}

const UpdatePlayback = (runtime, length = -1) => {
  let runtimeDate = new Date(runtime);
  trackRuntimeElement.textContent = runtimeDate.getMinutes() + ":" + ("0" + runtimeDate.getSeconds()).slice(-2);

  // if length exists, change the length
  if(length > 0){
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
async function getCurrentTrack(){
  const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + currentToken.access_token },
  });

  // No Content, track player has no song selected.
  if(response["status"] === 204) { 
    SpotifyErrorHandler(response["status"]);
    return null; 
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
    }),
  });
  
  const responseJson = await response.json()
  currentToken.save(responseJson);
  return responseJson;
}
//#endregion Spotify API

// Handles: 204, 304, 400, 401, 404, 429, 500, 502, 503
const SpotifyErrorHandler = (error, func = null) => {
  if(error["message"]){
    console.log(error["status"] + ": " + error["message"])
  }
  else {
    console.log(error["status"]);
  }
  switch(error["status"]){
    case 204:
      // set polling to idle since no song is selected in track Player
      currentRate = idleRate;
      break;
    case 304:
      break;
    case 400:
      break;
    case 401:
      break;
    case 404:
      break;
    case 429:
      const wait_Time = error.headers.get("retry-after");
      console.log("Rate Limited. Retrying in " + wait_Time + " seconds.");
      if(func){
        setTimeout(async () => {await func();}, wait_Time * 1000)
      }
      break;
    case 500:
      break;
    case 502:
      break;
    case 503:
      break;
    default:
      break;
  }
}

const InitializeSpotifyAPI = async (fieldData) => {
  // Order of code logic:
  // On startup(WidgetLoad):
  // 1. If we have expired access token
  //   1a. Refresh access token
  // 2. Else we will ask user to Authorize app and relaunch the widget(close widget after prompt)
  if(!(currentToken.refresh_token)){
    currentToken.save(fieldData);
  }

  const currentTime = new Date();
  if(currentToken.expires - timeWindowForRefreshToken <= currentTime){
    let refreshToken = await refreshCurrentToken();

    // TODO: error catches rejected promise, catch will catch errors
    refreshToken.then((data) => {
      return data;
    }, (rejected) => {
      // Only looking for 429
      SpotifyErrorHandler(rejected, refreshCurrentToken);
    }).catch((error) => {
      console.log("Error: " + error);
    }); 
  }
  else{
    console.log("Spotify Widget missing field data, refer to setup page on how to authorize this app.");
    return Promise.reject("Spotify Widget missing field data.");
  }
}

/*
  This function should be a loop:
  - We use a recursive call with promises. This forces us to wait until fail or success on prior request.
  - When we finish fetching data, we then execute the UI updating code and fetch again.
  
  const promise = new Promise((resolve, reject) => {
    // Perform asynchronous operation
    setTimeout(() => {
      resolve("Data fetched successfully!"); // Resolve the promise with data
    }, 1000);
  });

  promise.then((data) => {
    // Code to execute on successful resolution
    console.log(data); // Output: "Data fetched successfully!"
  }).catch((error) => {
    // Code to execute on rejection (if an error occurs)
    console.error(error);
  });
*/
const App_Function = async () => {
    if(isAppBusy){
      return;
    }

    isAppBusy = true;

    // During Execution:
    // 1. Refresh access token while within timeWindowForRefreshToken
    if(currentToken.expires - timeWindowForRefreshToken <= currentTime){
      await refreshCurrentToken().then((data) => {
        return data;
      }, (rejected) => {
        SpotifyErrorHandler(rejected, refreshCurrentToken);
      }).catch((error) => {
        console.log("Error: " + error);
      });
    }

    // 2. Grab content
    contentPromise = await getCurrentTrack();
    
    // 3. If we have new content: 
    //   - Update UI with content
    //   - TODO: Check if Playback is paused here and handle it
    // contentPromise fulfills true if we have resolved promise or rejected promise, false if gettingContent(true)
    // 4. If track doesnt exist or song isn't playing:
    //   - Slow down polling rate
    if(contentPromise){
      contentPromise.then((data) => {
        UpdateTrackName(data["item"].name);
        UpdateTrackArtist(data["item"].artists);
        UpdatePlayback(data["progress_ms"], data["item"].duration);
        
        // Since we track player is active(we are receiving content), half the 
        if((currentRate != normalRate) && data["is_playing"]){
          currentRate = Math.max(((currentRate - normalRate) / 2) + normalRate, normalRate);
        }
        else {
          currentRate = idleRate;
        }
      }, (rejected) => {
        SpotifyErrorHandler(rejected);
      }).catch((error) => {
        console.log("Error: " + error);
      });
    }

    isAppBusy = false;
}

const AppQuit = () => {
  trackNameElement.removeEventListener("animationend", playTrackNameAnimation);
  trackArtistElement.removeEventListener("animationend", playTrackArtistAnimation);
  clearInterval(appIntervalID);
  appIntervalID = null;
}

window.addEventListener('onWidgetLoad', async function (obj) {
  // getting field data from streamlabs
  fieldData = obj.detail.fieldData;
  clientId = fieldData["spotifyClientID"];
  clientSecret = fieldData["spotifyClientSecretID"];

  let elapsedTimeSinceAppFunctionCall = currentRate;
  
  // Initialization/setup
  InitializeUI();
  const setupResult = InitializeSpotifyAPI();

  // Over engineering so I feel good
  setupResult.then((resolved) => {
    appIntervalID = setInterval(() => {
      if(elapsedTimeSinceAppFunctionCall >= currentRate){
        App_Function();
        elapsedTimeSinceAppFunctionCall = 0;
      }
      elapsedTimeSinceAppFunctionCall += tickRateForFunctionCalls
    }, tickRateForFunctionCalls);
  }, (rejected) => {
    AppQuit();
  }).catch((error) => {
    console.log("Error: " + error);
  });
});

onbeforeunload = (event) => {
  AppQuit();
};



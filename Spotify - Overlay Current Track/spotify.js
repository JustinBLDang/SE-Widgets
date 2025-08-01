//#region Variables
const desiredAnimationTime = 6.144;
const desiredWidth = 551.53 - 352.6;
let currentTrackLength;
let appIntervalID;
let runtimeMinutes = 0;
let runtimeSeconds = 0;
let isTrackPlaying = false;

// Elements
let trackCoverElement, trackCanvasElement, trackNameElement, trackArtistElement, trackNameViewportElement, trackRuntimeElement, trackLengthElement, trackPlaybackBarElement;

// Codes
let clientId, clientSecret, authCode;

// Intervals. Tick rate must be LCM of all other rates.
let tickRate = 250;
let normalRate = 500;
let currentRate = normalRate;
let idleRate = 2000;
playbackRate = 1000;

// Elapsed Time
let elapsedTimeSinceAppFunctionCall = currentRate;
let elapsedTimeSincePlaybackUpdate = playbackRate;

// Refresh Token Window
let timeWindowForRefreshToken = 60000; // Attempt refresh 60s before expiration.

// Guards
let isAppBusy = false, isAppRateLimited = false;

// Access points / URL
const tokenEndpoint = "https://accounts.spotify.com/api/token";
const redirectUrl = "https://justinbldang.github.io/spotify-authorization/"

//#region Helper Function/Structures
const getFromSEStorage = async (value) => {
  let returnVal = null;
  await SE_API.store.get(value).then((data) => {
    returnVal = data.value;
  }, (rejected) => {
    console.error(rejected);
  }).catch((error) => {
    console.error(error);
  });
  return returnVal;
}

// Data structure that manages the current active token, caching it in SE_API
const currentToken = {
  access_token: null,
  refresh_token: null,
  authorization_code: null,
  expires_in: null,
  expires: null,

  save: function (response) {
    const { access_token, refresh_token, expires_in, code } = response;

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
      const expires = new Date(now.getTime() + (expires_in * 1000)).getTime();
      SE_API.store.set("expires", expires);
      this.expires = expires;
    }

    if(code){
      SE_API.store.set("authorization_code", code);
      this.authorization_code = code;
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
      this.expires = new Date(data);
    });
    await getFromSEStorage("authorization_code").then((data) => {
      this.authorization_code = data;
    });

    return this;
  }
};

const pauseAndCall = async (func, wait_Time) => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(func());
    }, wait_Time);
  });
}
//#endregion Helper Function/Structures

//#region UI
// Used for adding delay at end of animation. Delay at start is done using animation-delay property(css)
function getVideoDimensionsOf(url) {
  return new Promise(resolve => {
    const video = document.createElement('video');

    video.addEventListener("loadedmetadata", function () {
      const height = this.videoHeight;
      const width = this.videoWidth;

      resolve({ height, width });
    }, false);

    // start download meta-datas.
    video.src = url;
    video.remove();
  });
}

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
  trackCanvasElement = document.getElementById("track-canvas");

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

const UpdateTrackCanvas = async (trackCanvas) => {
  if(!trackCanvas){
    trackCanvasElement.src = 'none';
  }
  else {
    getVideoDimensionsOf(trackCanvas).then((data) => {
      trackCanvasElement.src = trackCanvas;

      if(data.width >= data.height){
        trackCanvasElement.className = "track-canvas-horizontal";
      }
      else {
        trackCanvasElement.className = "track-canvas-vertical";
      }
    });
  }
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

// UpdatePlayback runs asynchronously and synchronously. Either seperate the synchronous code into another function
// or keep it this way.
const UpdatePlayback = (runtime = -1, length = -1) => {
  // Synchronous code
  if(!isTrackPlaying){
    return;
  }
  if(runtime == -1 && length == -1){
    if(elapsedTimeSincePlaybackUpdate < playbackRate){
      return;
    }
    const temp = new Date();
    console.log(temp.getSeconds());
    elapsedTimeSincePlaybackUpdate = 0;
    runtimeSeconds++;

    if(runtimeSeconds >= 60){
      runtimeSeconds = 0;
      runtimeMinutes++;
    }
    trackRuntimeElement.textContent = runtimeMinutes + ":" + ("0" + runtimeSeconds).slice(-2);
    return;
  }

  // asynchronous code
  if(runtime > 0){
    let runtimeDate = new Date(runtime);
    if(runtimeDate.getSeconds() > runtimeSeconds + 1 || runtimeDate.getSeconds() < runtimeSeconds - 1) {
      runtimeSeconds = runtimeDate.getSeconds();
    }

    runtimeMinutes = runtimeDate.getMinutes();
    trackRuntimeElement.textContent = runtimeMinutes + ":" + ("0" + runtimeSeconds).slice(-2);
  }

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
  }).catch(e => { console.error(e); });

  response.function = "GetCurrentTrack";
  response.status == "204" ? response.message = "No Track Currently Playing." : "";

  // Check if no content found in track player
  if (await SpotifyErrorHandler(response)) {
    return Promise.reject({ status: "get-content-fail" });
  }

  return await response.json();
}

/*
  TODO: READ SPOTIFY DEVELOPER TERMS OF SERVICE: https://developer.spotify.com/terms
  
  Access unofficial API
  
  response.json() looks like:
  {
  canvasesList: [{
    artist: {
      artistImgUrl: "https://i.scdn.co/image/ab6761610000f178b41d06008db6aff64378b802",
      artistName: "THE ORAL CIGARETTES",
      artistUri: "spotify:artist:4rqJz9fE9prZvQd8WsQv6q"
    },
    canvasUri: "spotify:canvas:59jj3pjFJyb6saEvJFFVPw",
    canvasUrl: "https://canvaz.scdn.co/upload/artist/4rqJz9fE9prZvQd8WsQv6q/video/a93806b9b6be4cd69c0d872c49bbacc6.cnvs.mp4",
    id: "a93806b9b6be4cd69c0d872c49bbacc6",
    otherId: "",
    trackUri: "spotify:track:3ll3777Lzzs15BdKwzbgIU"
  }]
  }
*/
async function getCurrentTrackCanvas(trackId) {
  const canvasAPIEndpointWithTrackID = new URL("CANVASAPI URL NOT PROVIDED CURRENTLY");
  canvasAPIEndpointWithTrackID.searchParams.set("trackId", trackId);

  try {
    const response = await fetch(canvasAPIEndpointWithTrackID.toString(), {
      method: 'GET'
    });
    response.function = "getCurrentTrackCanvas";
    response.message = "No canvas available for current track.";

    if (await SpotifyErrorHandler(response)) {
      return "";
    }
    return (await response.json()).canvasesList[0].canvasUrl;
  }
  catch(e) {
    console.error(e);
  }
  return "";
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

  response.function = "refreshCurrentToken";

  if (await SpotifyErrorHandler(response)) {
    return Promise.reject({ status: "refresh-fail" });
  }

  currentToken.save(await response.json());
  return Promise.resolve({ status: "refresh-success" });
}

async function getAccessToken() {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret)
    },
    body: new URLSearchParams({
      code: currentToken.authorization_code,
      redirect_uri: redirectUrl,
      grant_type: 'authorization_code'
    })
  }).catch((error) => {
    SpotifyErrorHandler(error);
    console.error("Encountered problem when retrieving Access Token.");
    return Promise.reject({ status: "get-access-code-fail" });
  });
  
  currentToken.save(await response.json());
  return Promise.resolve({ status: "get-access-code-success" });
}

// Handles: 204, 304, 400, 401, 404, 429, 500, 502, 503
const SpotifyErrorHandler = async (error, func = null) => {
  if(error["status"] == 200){
    return;
  }
  let message = error["status"] ? "(SpotifyErrorHandler) Status: " + error["status"] : "(SpotifyErrorHandler) Status: None";
  message += error["function"] ? "\nCalled from: " + error["function"] : "";
  message += error["message"] ? "\nMessage: " + error["message"] : "";
  message += error["error"] ? "\nError: " + error["error"] : "";
  message += error["error_description"] ? "\nError Description: " + error["error_description"] : "";
  console.log(message);
  // console.log("Raw error:\n %O", error);

  switch (error["status"]) {
    case 204:
      if(error["function"] == "GetCurrentTrack") {
        currentRate = idleRate;
      }
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
      console.error("(SpotifyErrorHandler) Rate Limited. Retrying in " + (wait_Time + safetyBuffer) + " seconds.");
      if (func) {
        isAppRateLimited = true;
        await pauseAndCall(func, (wait_Time + safetyBuffer) * 1000);
        console.log("(SpotifyErrorHandler) Retrying widget.");
        isAppRateLimited = false;
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
//#endregion Spotify API
//#region Widget
const InitializeSpotifyAPI = async (fieldData) => {
  clientId = fieldData["spotifyClientID"];
  clientSecret = fieldData["spotifyClientSecretID"];
  authCode = fieldData["spotifyAuthCode"];
  
  await currentToken.retrieve();
  // If app breaks, sometimes user will have to reauthenticate and grab new access token.
  if(!currentToken.access_token || (currentToken.authorization_code != authCode)){
    currentToken.save({code: authCode});
    getAccessToken().catch((error) => { console.error(error); });
  }

  const currentTime = new Date();
  if (!currentToken.expires || (currentToken.expires - timeWindowForRefreshToken <= currentTime)) {
    await refreshCurrentToken().then((data) => {
      console.log("(InitializeSpotifyAPI) Refreshed Token");
    }).catch((error) => {
      console.log("(InitializeSpotifyAPI) Failed token refreshing");
      SpotifyErrorHandler(error, refreshCurrentToken);
      return Promise.reject({ status: "setup-fail", message: "(InitializeSpotifyAPI) Error on Initialization. Could not refresh token." });
    });
  }

  return Promise.resolve({ status: "setup-success", message: "" });
}

const App_Function = async () => {
  // Ensures the program makes calls following the currentRate. tickRate should be LCM of all values that use it.
  elapsedTimeSinceAppFunctionCall += tickRate;
  elapsedTimeSincePlaybackUpdate += tickRate;
  UpdatePlayback();
  
  if (isAppBusy || isAppRateLimited || (elapsedTimeSinceAppFunctionCall < currentRate)) {
    return;
  }
  isAppBusy = true;

  const currentTime = new Date();
  if (!currentToken.expires || (currentToken.expires - timeWindowForRefreshToken <= currentTime)) {
    await refreshCurrentToken().then((data) => {
      console.log("(App_Function) Refreshed Token");
    }).catch((error) => {
      console.log("(App_Function) Failed token refreshing");
      SpotifyErrorHandler(error, refreshCurrentToken);
      isAppBusy = false;
      return;
    });
  }

  let content = await getCurrentTrack().catch(e => { console.error(e) });

  // true if content is resolved, false otherwise
  if (content) {
    isTrackPlaying = true;
    if(content["item"].name != trackNameElement.textContent){
      let canvasUrl = await getCurrentTrackCanvas(content["item"].id);
      UpdateTrackName(content["item"].name);
      UpdateTrackArtist(content["item"].artists);
      UpdateTrackCover(content["item"].album.images[1].url);
      UpdateTrackCanvas(canvasUrl);
    }
    UpdatePlayback(content["progress_ms"], content["item"].duration_ms);

    // If track player is playing a song, linear decrease of interval period by tickRate
    if (currentRate != normalRate) {
      currentRate = Math.max(currentRate - tickRate, normalRate);
    }
  }
  else {
    isTrackPlaying = false;
  }
  elapsedTimeSinceAppFunctionCall = 0;
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

window.addEventListener('onWidgetLoad', async function (obj) {
  // TODO: onWidgetLoad not consistent during development(executing before DOM tree loads), maybe in future try DOMContentLoaded. 
  await pauseAndCall(() => {console.log("--------------------Widget Started--------------------")}, 1000);
  
  // getting field data from json file/values entered by user on stream elements
  fieldData = obj.detail.fieldData;

  // Initialization/setup
  InitializeUI();
  await InitializeSpotifyAPI(fieldData).catch(error => { console.log(error); });

  appIntervalID = setInterval(App_Function, tickRate);
});

onbeforeunload = (event) => {
  AppQuit();
};
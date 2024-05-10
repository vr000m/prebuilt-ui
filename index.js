/*
 * Main functions: core call infrastructure, setting up the callframe and event listeners, creating room URL, and joining
 * Event listener callbacks: fired when specified Daily events execute
 * Call panel button functions: participant controls
 */

/* Main functions */
let callFrame, room, networkUpdateID, callUrl, endpoints;

async function createCallframe() {
  const callWrapper = document.getElementById('wrapper');
  callFrame = window.DailyIframe.createFrame(callWrapper);

  callFrame
    .on('loaded', showEvent)
    .on('started-camera', showEvent)
    .on('camera-error', showEvent)
    .on('joining-meeting', toggleLobby)
    .on('joined-meeting', handleJoinedMeeting)
    .on('left-meeting', handleLeftMeeting);

  const roomURL = document.getElementById('url-input');
  const joinButton = document.getElementById('join-call');
  const createButton = document.getElementById('create-and-start');
  roomURL.addEventListener('input', () => {
    if (roomURL.checkValidity()) {
      joinButton.classList.add('valid');
      joinButton.classList.remove('disabled-button');
      joinButton.removeAttribute('disabled');
      createButton.classList.add('disabled-button');
    } else {
      joinButton.classList.remove('valid');
    }
  });

  roomURL.addEventListener('keyup', (event) => {
    if (event.keyCode === 13) {
      event.preventDefault();
      joinButton.click();
    }
  });
}

function addDisplayElement(tag, parentTag, id, url) {
  const roomPropsList = document.getElementById(parentTag);
  const newTag = document.createElement(tag);
  newTag.id = id;
  newTag.href = url;
  newTag.textContent = url;

  const newListItem = document.createElement("li");
  newListItem.appendChild(newTag);
  roomPropsList.appendChild(newListItem);
}

// Unsure if the apis will always return `sip:``
function appendSip(ep) {
  // Check if the endpoint already starts with "sip:"
  // If it already starts with "sip:", return it as is
  if (!ep.startsWith("sip:")) {
    return "sip:" + ep;
  }
  return ep;
}

function removeAllSubDivs(parentTag) {
  const div = document.getElementById(parentTag);
  if (div.hasChildNodes()) {
    while (div.firstChild) {
      div.removeChild(div.firstChild);
    }
  }
}

// display pstn/sip details
function displayRoomProps(dailyRoom) {
  // our default number is +1 (209) 503-8039
  const dialinNumber = dailyRoom.config.dialin_number ?? "+12095038039";
  const dialinCode = dailyRoom.config.dialin_code ?? null;
  // const dialinNumber = dailyRoom && dailyRoom.config && dailyRoom.config.dialin_number ? dailyRoom.config.dialin_number : "+12095038039";
  // const dialinCode = dailyRoom && dailyRoom.config && dailyRoom.config.dialin_code !== undefined ? dailyRoom.config.dialin_code : null;

  const endpoint = dailyRoom.config.sip_uri?.endpoint ?? null;
  const extraEndpoints = dailyRoom.config.sip_uri?.extra_endpoints ?? null;
  const enableDialout = dailyRoom.config.enable_dialout ?? null;
  const enableDialoutId = document.getElementById('active-dialout');

  //remove all items first,
  removeAllSubDivs("room-properties-list");
  removeAllSubDivs("inputs-container");

  // add the dialin number and code here to display
  if (dialinCode !== null) {
    const telFormat = `tel:${dialinNumber},,${dialinCode}`;
    addDisplayElement("a", "room-properties-list", "dialin-pstn-code", telFormat);
  }

  if (!endpoint || endpoint.trim() === "" || typeof endpoint === "undefined") {
    // if enable_dialout is true, show the div
    if (enableDialout) {
      enableDialoutId.style.display = "block"; //flex or block?
      // adding a dummy endpoint, it is not needed for but we can do dialout
      endpoint = "";
    } else {
      return;
    }
  } else {
    // if endpoints are available, show the div
    enableDialoutId.style.display = "block"; //flex or block?
  }

  // get providers
  const providerContainer = document.getElementById("provider-container");
  providerContainer.style.display = "inline-block";

  const providerSelect = document.getElementById("provider-select");
  // Set Twilio as the default provider
  providerSelect.value = "twilio";
  selectedProvider = providerSelect.value;
  providerSelect.addEventListener("change", function() {
    selectedProvider = providerSelect.value;
  });

  // handle all the sip uris here
  endpoints = [
    appendSip(endpoint),
    ...(extraEndpoints && extraEndpoints.length > 0 ? extraEndpoints.map(appendSip) : [])
  ];

  const container = document.getElementById("inputs-container");

  endpoints.forEach((ep, index) => {
    addDisplayElement("a", "room-properties-list", `dialin-sip-uri-" ${index + 1}`, `${ep}`);

    // lets create a dialout button for each endpoint
    const actionContainer = document.createElement("div");
    actionContainer.classList.add("copy-url-action");

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Phone number (+16506950000)`;
    // input.setAttribute("pattern", "^\\d{10,}$|^\\+\\d+$");

    const button = document.createElement("button");
    button.textContent = "Dialout";
    button.classList.add("button", "copy-url-button");
    button.addEventListener("click", function() {
      const phNum = input.value;
      data = {
        endpoint: ep,
        phoneNumber: phNum,
      };
      dialoutToPhone(selectedProvider, data)
    });

    actionContainer.appendChild(input);
    actionContainer.appendChild(button);
    container.appendChild(actionContainer);
    // probably needs padding somewhere
    // actionContainer.appendChild(document.createElement("br"));
    actionContainer.style.marginBottom = "10px";
  });
}

async function dialoutToPhone(provider, data) {
  console.log("***** dialoutToPhone(): ", provider, data);
  if (selectedProvider === 'twilio') {
    const sessionId = await dialoutViaTwilio(data.endpoint, data.phoneNumber);
    // sessionId will contain status that we can show,
    // and a sid, in case we need to end the session
    // {"sid":"CAb646b7cde77c4c7bb5110202b80ad1d8","status":"in-progress","try_count":1}
    console.log("***** twilio called and returned a sessionId", sessionId);

  } else if (selectedProvider === 'signalwire') {
    // const pstnSessionId = await callFrame.startDialOut({
    //   phoneNumber: '+17868748498',
    //   displayName: 'Mr. Xyz',
    // });
    const sessionId = dialoutViaSignalwire(data.phoneNumber);
    console.log("***** signalwire called and returned a sessionId", sessionId);
  } else {
    console.log('Selected provider is unknown');
  }
}

// curl -H "Content-Type: application/json" \
//      -H "Authorization: Bearer $TOKEN" \
//      -XPOST -d '{"sipUri": "sip:", "video":false }' \
//      https://api.daily.co/v1/rooms/hello/dialOut/start
// OR
//  -XPOST -d '{"phoneNumber": "+1556655665", displayName:"X", "video":false }' \

async function dialoutViaSignalwire(data) {

  const url = new URL(callUrl);
  const path = url.pathname;
  const dialOutEndpoint = `${window.location.origin}/api/rooms${path}/dialOut/Start`;

  const options = {
    phoneNumber: data,
    displayName: data
  }

  // dialout via signalwire
  sid = await fetchDaily(dialOutEndpoint, options);
  return sid;
}

// curl --request POST \
//   --url https://kwgcr47k3lyczvnbj2tyj6hcda0kxomv.lambda-url.us-east-2.on.aws/ \
//   --header 'Content-Type: application/json' \
//   --data '{
//     "sipUri":
//       "sip:1141042273112552070@f3cc8-app.sip.daily.co?x-roomName=tdHdpbGlvZGFpbHk&x-daily_display_name=MG",
//     "phoneNumber": ["+1..."]
// }'
async function dialoutViaTwilio(ep, phoneNum) {
  const twilioEndpoint = `${window.location.origin}/api/twilio-call/`;
  console.log("**** dialoutViaTwilio: ", ep + `&x-daily_display_name=` + phoneNum);
  const options = {
    "sipUri": ep + `&x-daily_display_name=` + phoneNum,
    "phoneNumber": [phoneNum]
  }

  // dialout via twilio
  sid = await fetchDaily(twilioEndpoint, options);
  return sid;
}

// See PSTN and SIP details at:
// https://docs.daily.co/guides/products/dial-in-dial-out
// display_name is the name that shows up in the call
// sip sets up dial-in in this case.
// sip_mode can be dial-out|dial-in
// num_endpoints can be 1 through 5 for dialin, do not need this for dialout
//"codecs":{"video":["VP8"],"audio":["OPUS"]},
// video can be true or false
// enable_dialout sets up dialout calls
async function activateSipPstn() {
  // parse path from room url
  const url = new URL(callUrl);
  const path = url.pathname;
  const updateRoomEndpoint = `${window.location.origin}/api/rooms` + path;

  const rpElement = document.getElementById('room-properties');
  rpElement.style.display = "block";

  // let numEndpoints = parseInt(document.getElementById('endpoint-input').value) ?? 5;
  // numEndpoints = isNaN(numEndpoints) ? 5 : numEndpoints;
  let numEndpoints = 5;
  console.log("***** activateSipPstn on url, room:", callUrl, path, updateRoomEndpoint, numEndpoints);

  // TODO: room exp was set at room creation?
  const days = 30;
  const exp = Math.round(Date.now() / 1000) + (60 * 60 * 24 * days);
  // setting other properties
  const options = {
    properties: {
      exp: exp,
      enable_prejoin_ui: false,
      autojoin: true,
      enable_video_processing_ui: true,
      enable_live_captions_ui: true,
      enable_adaptive_simulcast: true,
      dialin: {
        display_name: "sw-pstn-dialin",
        wait_for_meeting_start: false,
      },
      sip: {
        display_name: 'sw-sip-dialin',
        sip_mode: 'dial-in',
        num_endpoints: numEndpoints,
        video: false,
      },
      enable_dialout: true,
    },
  };

  // update the existing room with new capabilities: SIP, PSTN
  room = await fetchDaily(updateRoomEndpoint, options);
  displayRoomProps(room);
  showDemoCountdown();
}

async function createMeetingToken(urlString) {
  // curl -H "Content-Type: application/json" \
  //      -H "Authorization: Bearer $API_KEY" \
  //      -XPOST -d \
  //      '{"properties":{"room_name":"room-0253"}}' \
  //      https://api.daily.co/v1/meeting-tokens
  const url = new URL(urlString);
  const path = url.pathname.substring(1);

  const tokenEndpoint = `${window.location.origin}/api/meeting-tokens/`;

  const options = {
    properties: {
      room_name: path,
      is_owner: true,
      auto_start_transcription: true,
      permissions: { canSend: true },
    },
  };

  meetingToken = await fetchDaily(tokenEndpoint, options);
  return JSON.stringify(meetingToken.token);
}

async function fetchDaily(endpoint, options) {
  try {
    let response = await fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(options),
      mode: 'cors',
    }),
      res = await response.json();
    console.log("***** fetchDaily: ", endpoint, res);
    return res;
  } catch (e) {
    console.error(e);
  }
}

async function createRoom() {
  // This endpoint is using the proxy as outlined in netlify.toml
  const newRoomEndpoint = `${window.location.origin}/api/rooms/`;

  // we'll add 30 min expiry (exp) so rooms won't linger too long on your account
  // we'll also turn on chat (enable_chat), sip, dialin, and all the !
  // see other available options at https://docs.daily.co/reference#create-room
  const mins = 30;
  const exp = Math.round(Date.now() / 1000) + 60 * mins;
  const options = {
    properties: {
      exp: exp,
      eject_at_room_exp: true,
      enable_mesh_sfu: false, // this can be set to true
      enable_chat: true,
      enable_advanced_chat: true,
      enable_prejoin_ui: false,
      enable_breakout_rooms: true,
      enable_emoji_reactions: true,
      enable_hand_raising: true,
      enable_recording: "cloud",
      autojoin: true,
      enable_network_ui: true,
      enable_pip_ui: true,
      enable_video_processing_ui: true,
      enable_live_captions_ui: true,
      enable_adaptive_simulcast: true,
      // dialin: {
      //   display_name: "sw-pstn-dialin",
      //   wait_for_meeting_start: false,
      // },
      sip: {
        // this is placeholder, use x-daily_display_name to set the name
        display_name: 'sw-sip-dialin',
        sip_mode: 'dial-in',
        num_endpoints: 5,
        video: false,
      },
      enable_dialout: true,
    },
  };

  // create new room!
  room = await fetchDaily(newRoomEndpoint, options);
  return room;

  // Comment out the above and uncomment the below, using your own URL
  // if you prefer to test with a hardcoded room
  // return { url: 'https://your-domain.daily.co/hello' };
}

async function createRoomAndStart() {
  const createAndStartButton = document.getElementById('create-and-start');
  const copyUrl = document.getElementById('copy-url');
  const errorTitle = document.getElementById('error-title');
  const errorDescription = document.getElementById('error-description');

  createAndStartButton.innerHTML = 'Loading...';

  room = await createRoom();
  if (!room) {
    errorTitle.innerHTML = 'Error creating room';
    errorDescription.innerHTML =
      "If you're developing locally, please check the README instructions.";
    toggleMainInterface();
    toggleError();
  }
  copyUrl.value = room.url;
  callUrl = room.url;
  // console.log("***** create room returned:", callUrl, room);

  meetingToken = await createMeetingToken(callUrl);

  displayRoomProps(room);
  showDemoCountdown();

  try {
    callFrame.join({
      url: callUrl,
      token: meetingToken,
      showLeaveButton: true,
    });
  } catch (e) {
    toggleError();
    console.error(e);
  }
}

async function joinCall() {
  const url = document.getElementById('url-input').value;
  const copyUrl = document.getElementById('copy-url');
  copyUrl.value = url;
  callUrl = url;

  meetingToken = await createMeetingToken(url);

  try {
    await callFrame.join({
      url: url,
      token: meetingToken,
      showLeaveButton: true,
    });
  } catch (e) {
    if (
      e.message === "can't load iframe meeting because url property isn't set"
    ) {
      toggleMainInterface();
      console.log('empty URL');
    }
    toggleError();
    console.error(e);
  }
  await activateSipPstn();
}

/* Event listener callbacks and helpers */
function showEvent(e) {
  console.log('callFrame event', e);
}

function toggleHomeScreen() {
  const homeScreen = document.getElementById('start-container');
  homeScreen.classList.toggle('hide');
}

function toggleLobby() {
  const callWrapper = document.getElementById('wrapper');
  callWrapper.classList.toggle('in-lobby');
  toggleHomeScreen();
}

function toggleControls() {
  const callControls = document.getElementById('call-controls-wrapper');
  callControls.classList.toggle('hide');
}

function toggleCallStyling() {
  const callWrapper = document.getElementById('wrapper');
  const createAndStartButton = document.getElementById('create-and-start');
  createAndStartButton.innerHTML = 'Create room and start';
  callWrapper.classList.toggle('in-call');
}

function toggleError() {
  const errorMessage = document.getElementById('error-message');
  errorMessage.classList.toggle('error-message');
  toggleControls();
  toggleCallStyling();
}

function toggleMainInterface() {
  toggleHomeScreen();
  toggleControls();
  toggleCallStyling();
}

function handleJoinedMeeting() {
  toggleLobby();
  toggleMainInterface();
  startNetworkInfoPing();
}

function handleLeftMeeting() {
  toggleMainInterface();
  if (networkUpdateID) {
    clearInterval(networkUpdateID);
    networkUpdateID = null;
  }
}

function resetErrorDesc() {
  const errorTitle = document.getElementById('error-title');
  const errorDescription = document.getElementById('error-description');

  errorTitle.innerHTML = 'Incorrect room URL';
  errorDescription.innerHTML =
    'Meeting link entered is invalid. Please update the room URL.';
}

function tryAgain() {
  toggleError();
  toggleMainInterface();
  resetErrorDesc();
}

/* Call panel button functions */
function copyUrl() {
  const url = document.getElementById('copy-url');
  const copyButton = document.getElementById('copy-url-button');
  url.select();
  document.execCommand('copy');
  copyButton.innerHTML = 'Copied!';
}

function toggleCamera() {
  callFrame.setLocalVideo(!callFrame.participants().local.video);
}

function toggleMic() {
  callFrame.setLocalAudio(!callFrame.participants().local.audio);
}

function toggleScreenshare() {
  let participants = callFrame.participants();
  const shareButton = document.getElementById('share-button');
  if (participants.local) {
    if (!participants.local.screen) {
      callFrame.startScreenShare();
      shareButton.innerHTML = 'Stop screenshare';
    } else if (participants.local.screen) {
      callFrame.stopScreenShare();
      shareButton.innerHTML = 'Share screen';
    }
  }
}

function toggleFullscreen() {
  callFrame.requestFullscreen();
}

function toggleLocalVideo() {
  const localVideoButton = document.getElementById('local-video-button');
  const currentlyShown = callFrame.showLocalVideo();
  callFrame.setShowLocalVideo(!currentlyShown);
  localVideoButton.innerHTML = `${currentlyShown ? 'Show' : 'Hide'
    } local video`;
}

function toggleParticipantsBar() {
  const participantsBarButton = document.getElementById(
    'participants-bar-button',
  );
  const currentlyShown = callFrame.showParticipantsBar();
  callFrame.setShowParticipantsBar(!currentlyShown);
  participantsBarButton.innerHTML = `${currentlyShown ? 'Show' : 'Hide'
    } participants bar`;
}

/* Other helper functions */

// Starts an interval to check local network info
// every 2 seconds.
function startNetworkInfoPing() {
  networkUpdateID = setInterval(() => {
    updateNetworkInfoDisplay();
  }, 2000);
}

// Populates 'network info' with information info from daily-js
async function updateNetworkInfoDisplay() {
  const videoSend = document.getElementById('video-send'),
    videoReceive = document.getElementById('video-receive'),
    videoPacketSend = document.getElementById('video-packet-send'),
    videoPacketReceive = document.getElementById('video-packet-receive');

  const statsInfo = await callFrame.getNetworkStats();
  const stats = statsInfo.stats;
  const latest = stats.latest;
  videoSend.innerHTML = `${Math.floor(
    latest.videoSendBitsPerSecond / 1000,
  )} kb/s`;

  videoReceive.innerHTML = `${Math.floor(
    latest.videoRecvBitsPerSecond / 1000,
  )} kb/s`;

  videoPacketSend.innerHTML = `${Math.floor(
    stats.worstVideoSendPacketLoss * 100,
  )}%`;

  videoPacketReceive.innerHTML = `${Math.floor(
    stats.worstVideoRecvPacketLoss * 100,
  )}%`;
}

function showRoomInput() {
  const urlInput = document.getElementById('url-input');
  const urlClick = document.getElementById('url-click');
  const urlForm = document.getElementById('url-form');
  urlClick.classList.remove('show');
  urlClick.classList.add('hide');

  urlForm.classList.remove('hide');
  urlForm.classList.add('show');
  urlInput.focus();
}

function showDemoCountdown() {
  const countdownDisplay = document.getElementById('demo-countdown');

  if (!window.expiresUpdate) {
    window.expiresUpdate = setInterval(() => {
      let exp = room && room.config && room.config.exp;
      if (exp) {
        let seconds = Math.floor((new Date(exp * 1000) - Date.now()) / 1000);
        let minutes = Math.floor(seconds / 60);
        let remainingSeconds = Math.floor(seconds % 60);

        countdownDisplay.innerHTML = `Demo expires in ${minutes}:${remainingSeconds > 10 ? remainingSeconds : '0' + remainingSeconds
          }`;
      }
    }, 1000);
  }
}

const APP_ID = "064d5c86b4a04a4caef8630a20edf0a1";

const socket = io({
    "query": {
        "user": userId,
        "room": roomId
    }
});

let token = null;
let client;
let localTracks = [];
let remoteUsers = {};

// class="w-2/5 rounded border border-gray-300"

const startCallBtn = document.getElementById('start-call');
const toggleMicBtn = document.getElementById('toggle-mic');
const toggleCamBtn = document.getElementById('toggle-camera');
const endForm = document.getElementById('hang-up');
const videosBox = document.getElementById('videos');

const form = document.getElementById('chat-form');
const input = document.getElementById('chat-box');

socket.on('message-received', (msg, from, name) => {
    const messages = document.getElementById('chat-messages');
    let chat = document.createElement('div');
    let chatbox = document.createElement('div');
    if (from == userId) {
        chat.classList = "chat chat-end";
    } else {
        chat.classList = "chat chat-start";
    }
    chat.innerHTML += '<div class="chat-header -z-10">' + name + '<time class="text-xs opacity-50">' + msg.time.toLocaleString('en-GB', { timeZone: 'UTC' }) + '</time></div>';
    chatbox.innerHTML = msg.msg;
    chatbox.classList = "chat-bubble chat-bubble-info -z-10";
    chat.appendChild(chatbox);
    messages.appendChild(chat);
    window.scrollTo(0, document.body.scrollHeight);
});

socket.on('error', (err) => {
    console.log(err);
});

form.addEventListener('submit', e => {
    e.preventDefault();
    if (input.value) {
        socket.emit('chat-message', input.value, Date.now());
        input.value = '';
    }
});

endForm.addEventListener('submit', e => {
    e.preventDefault();
    leaveStream();
});

const joinStream = async () => {
    client = AgoraRTC.createClient({mode:'rtc', codec:'vp8'});
    await client.join(APP_ID, roomId, token, userId);

    client.on('user-published', handleUserPublished);
    client.on('user-left', handleUserLeft);

    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();

    const player=`<div class="video-container" id="user-container-${userId}">
                    <div class="video-player" id="user-${userId}"></div>
                </div>`;
    
    videosBox.insertAdjacentHTML("beforeend", player);

    localTracks[1].play(`user-${userId}`);
    await client.publish([localTracks[0], localTracks[1]]);
};

const leaveStream = async () => {
    for (let i = 0; i < localTracks.length; i++) {
        localTracks[i].stop();
        localTracks[i].close();
    }
    await client.unpublish([localTracks[0], localTracks[1]]);
    await client.leave();
    client = null;
    document.getElementById(`user-container-${userId}`).remove();
};

const toggleMic = async e => {
    let button = e.currentTarget

    if (localTracks[0].muted) {
        await localTracks[0].setMuted(false);
        button.classList = "btn btn-ghost";
    } else {
        await localTracks[0].setMuted(true)
        button.classList = "btn btn-primary";
    };
};

const toggleCamera = async e => {
    let button = e.currentTarget

    if (localTracks[1].muted) {
        await localTracks[1].setMuted(false);
        button.classList = "btn btn-ghost";
    } else {
        await localTracks[1].setMuted(true)
        button.classList = "btn btn-primary";
    };
};

const handleUserPublished = async (user, mediaType) => {
    remoteUsers[user.uid] = user;
    await client.subscribe(user, mediaType);

    let player = document.getElementById(`user-container-${user.uid}`);
    if (player === null) {
        player=`<div class="video-container" id="user-container-${user.uid}">
                    <div class="video-player" id="user-${user.uid}"></div>
                </div>`;

        videosBox.insertAdjacentHTML("beforeend", player);
    }

    if (mediaType === 'video') {
        user.videoTrack.play(`user-${user.uid}`);
    }

    if (mediaType === 'audio') {
        user.audioTrack.play();
    }
};

const handleUserLeft = async user => {
    delete remoteUsers[user.uid];
    let item = document.getElementById(`user-container-${user.uid}`);
    if (item) {
        item.remove();
    }
};

startCallBtn.addEventListener('click', joinStream);
toggleMicBtn.addEventListener('click', toggleMic);
toggleCamBtn.addEventListener('click', toggleCamera);
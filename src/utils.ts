import { socket } from ".";
import { ShareOptionEnum } from "./types";

export const switchScreenShareTrack = async (
  connection: RTCPeerConnection,
  localPlayer: HTMLVideoElement
) => {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });

  const [videoTrack] = stream.getVideoTracks();

  console.log(connection.getSenders());

  const videoSender = connection
    .getSenders()
    .find((sender) => sender.track?.kind === videoTrack.kind);

  if (videoSender) {
    videoSender.replaceTrack(videoTrack);
  }

  localPlayer.srcObject = stream;
};

export const call = async (
  connection: RTCPeerConnection,
  calleeId: string,
  shareOption: ShareOptionEnum | null
) => {
  if (!shareOption) {
    return alert("공유방법을 선택해주세요.");
  }

  const offer = await connection.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
  });

  await connection.setLocalDescription(offer);

  socket.emit("user:join", calleeId);
  socket.emit("offer", offer, calleeId, shareOption);
};

export const getLocalStream = async (shareOption: ShareOptionEnum) => {
  if (!navigator.mediaDevices) return;

  switch (shareOption) {
    case ShareOptionEnum.AUDIO_ONLY: {
      return await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });
    }
    case ShareOptionEnum.WITH_CAMERA: {
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    }
    case ShareOptionEnum.WITH_DISPLAY: {
      const stream = new MediaStream();

      const dispalyVideoStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      const MicrophoneAudioStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });

      stream.addTrack(dispalyVideoStream.getTracks()[0]);
      stream.addTrack(MicrophoneAudioStream.getTracks()[0]);

      return stream;
    }
    default:
      return null;
  }
};

export const addTrackToConnection = async (
  stream: MediaStream,
  connection: RTCPeerConnection
) => {
  stream.getTracks().forEach((track) => {
    if (!connection) return;
    connection.addTrack(track, stream);
  });
};

export const playLocalStreamOnPlayer = (
  stream: MediaStream,
  localPlayer: HTMLVideoElement
) => {
  localPlayer.srcObject = stream;
  localPlayer.autoplay = true;
};

export const acceptIncommingCall = async (
  connection: RTCPeerConnection,
  callerId: string
) => {
  const answer = await connection.createAnswer();
  socket.emit("answer", answer, callerId);
  await connection.setLocalDescription(answer);
};

export const rejectIncommingCall = (callerId: string) => {
  socket.emit("connect:reject", callerId);
};

import { useCallback, useEffect, useRef } from "react";
import { TURN_SERVER, TURN_SERVER_PASSWORD, TURN_SERVER_USER_NAME } from "../constants";
import { socket } from "../index";
import { DataChannelMessage } from "../types";

const useWebRTC = ({
  onReceiveChatMessage,
  userName,
  localPlayer,
  remotePlayer,
}: {
  onReceiveChatMessage: (chat: DataChannelMessage) => void;
  userName: string;
  localPlayer: React.MutableRefObject<
    HTMLAudioElement | HTMLVideoElement | null
  >;
  remotePlayer: React.MutableRefObject<
    HTMLAudioElement | HTMLVideoElement | null
  >;
}) => {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const createPeerConnection = useCallback(() => {
    if (!userName) {
      return console.log("no userName for create connection");
    }
    if (peerConnectionRef.current) {
      return console.log("already has connection");
    }
    const connection = new RTCPeerConnection({
      iceServers: [
        {
          urls: TURN_SERVER,
          username: TURN_SERVER_USER_NAME,
          credential: TURN_SERVER_PASSWORD,
        },
      ],
      iceTransportPolicy: "all",
    });

    // listners
    connection.ondatachannel = onConnectionDataChannel;
    connection.onicecandidate = onConnectionIceCandidate;
    connection.onicecandidateerror = onConnectionIceCandidateError;
    connection.onconnectionstatechange = onConnectionStateChnage;
    connection.ontrack = onConnectionTrack;

    peerConnectionRef.current = connection;
  }, [userName]);

  function onConnectionDataChannel(e: RTCDataChannelEvent) {
    const dataChannel = e.channel;
    dataChannel.onopen = onDataChannelOpen;
    dataChannel.onclose = onDataChannelClosed;
    dataChannel.onmessage = onDataChannelMessage;
  }

  function onConnectionIceCandidate(e: RTCPeerConnectionIceEvent) {
    socket.emit("new-ice-candidate", e.candidate);
  }

  function onConnectionIceCandidateError(e: Event) {
    console.log("candidate Error", e);
  }

  function onConnectionStateChnage(this: RTCPeerConnection, e: Event) {
    const state = this.connectionState;
    switch (state) {
      case "connected": {
        console.log("peer connected");
        break;
      }
      case "closed":
      case "failed":
      case "disconnected": {
        console.log("peer disconnected");
        closeConnection();
        socket.emit("user:available", userName);
      }
    }
  }

  function onConnectionTrack(this: RTCPeerConnection, e: RTCTrackEvent) {
    if (!remotePlayer.current) {
      return console.log("remotePlayer not found");
    }
    console.log("track detected");
    const srcObject = e.streams[0];
    remotePlayer.current.srcObject = srcObject;
    remotePlayer.current.autoplay = true;
    console.log("remote media added to remote player");
  }

  function onCreateDataChannel(connection: RTCPeerConnection) {
    const dataChannel = connection.createDataChannel("message");
    dataChannel.onopen = onDataChannelOpen;
    dataChannel.onclose = onDataChannelClosed;
    dataChannel.onmessage = onDataChannelMessage;

    return dataChannel;
  }

  function onDataChannelOpen(e: Event) {
    console.log("data channel opend");
  }

  function onDataChannelClosed(e: Event) {
    console.log("data channel closed");
  }

  async function onDataChannelMessage(e: MessageEvent) {
    console.log(performance.now());
    const messageData = JSON.parse(e.data) as DataChannelMessage;
    onReceiveChatMessage(messageData);
  }

  const closeConnection = () => {
    if (!peerConnectionRef.current) {
      return console.log("no connection");
    }
    peerConnectionRef.current.ondatachannel = null;
    peerConnectionRef.current.onicecandidate = null;
    peerConnectionRef.current.onicecandidateerror = null;
    peerConnectionRef.current.onconnectionstatechange = null;
    peerConnectionRef.current.ontrack = null;
    peerConnectionRef.current.close();
    peerConnectionRef.current = null;

    if (localPlayer.current) {
      localPlayer.current.srcObject = null;
    }

    if (remotePlayer.current) {
      remotePlayer.current.srcObject = null;
    }
  };

  useEffect(() => {
    return closeConnection;
  }, []);

  return {
    connection: peerConnectionRef,
    createPeerConnection,
    onCreateDataChannel,
    closeConnection,
  };
};

export default useWebRTC;

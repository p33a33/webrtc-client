import { useEffect, useRef, useState } from "react";
import "./App.css";
import { socket } from ".";

const uri = window.location.href;

const connection = new RTCPeerConnection({
  iceServers: [
    {
      urls: "turn:192.168.0.17",
      username: "david",
      credential: "david",
    },
  ],
  iceTransportPolicy: "all",
});

enum CallStateEnum {
  "WAITING" = "WAITING",
  "MAKE CALL" = "MAKE CALL",
  "INCOMING CALL" = "INCOMING CALL",
  "ON THE PHONE" = "ON THE PHONE",
}

interface ChatMessage {
  userName: string;
  message: string;
  createdAt: string;
}

function App() {
  const [userName, setUserName] = useState<string>("");
  const [availableUsers, setAvailableUsers] = useState<
    { name: string; state: "AVAILABLE" | "UNAVAILABLE"; id: string }[]
  >([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [callState, setCallState] = useState<CallStateEnum>(
    CallStateEnum.WAITING
  );
  const userNameInput = useRef<HTMLInputElement>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const incomingOffer = useRef<{
    offer: RTCSessionDescriptionInit;
    callerId: string;
  } | null>(null);
  const chatMessageInputRef = useRef<HTMLInputElement>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const localStream = useRef<MediaStream | null>(null);
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const chatViewRef = useRef<HTMLDivElement>(null);

  const isIncomingCall = callState === CallStateEnum["INCOMING CALL"];

  const onDataChannelOpen = (e: Event) => {
    if (!dataChannelRef.current) return;
    console.log("data channel opened", e);
  };

  const onDataChannelClose = (e: Event) => {
    console.log("data channel closed", e);
  };

  const onDataChannelMessage = (e: MessageEvent) => {
    const messageData = JSON.parse(e.data) as ChatMessage;
    setChatMessages((prev) => [...prev, messageData]);
  };

  const onPeerConnectionFoundICECandidate = (e: RTCPeerConnectionIceEvent) => {
    if (!e.candidate) return;
    console.log("find new candidate", e);
    socket.emit("new-ice-candidate", e.candidate);
  };

  const onPeerConnectionFoundICECandidateError = (e: Event) => {
    console.log("iceCandidate Error : ", e);
  };

  const onPeerConnectionStateChanged = async (e: Event) => {
    if (!connection) return;

    switch (connection.connectionState) {
      case "connected": {
        console.log("connected");
        setCallState(CallStateEnum["ON THE PHONE"]);
        break;
      }
      case "closed":
      case "failed":
      case "disconnected": {
        console.log("disconnected");
        setCallState(CallStateEnum["WAITING"]);
        socket.emit("user:available", userName);
        break;
      }
    }
  };

  const onPeerConnectionDataChannelOpend = (e: RTCDataChannelEvent) => {
    const dataChannel = (dataChannelRef.current = e.channel);
    dataChannel.addEventListener("open", onDataChannelOpen);
    dataChannel.addEventListener("close", onDataChannelClose);
    dataChannel.addEventListener("message", onDataChannelMessage);
  };

  const onPeerConnectionTrackAdded = (e: RTCTrackEvent) => {
    if (!remoteAudioRef.current) return;
    console.log("track added");
    remoteAudioRef.current.autoplay = true;
    remoteAudioRef.current.srcObject = e.streams[0];
  };

  const getLocalAudioStream = async () => {
    if (!navigator.mediaDevices) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: true,
    });

    if (!localAudioRef.current) return;
    localStream.current = stream;
    localAudioRef.current.srcObject = stream;
    localAudioRef.current.autoplay = true;
  };

  useEffect(() => {
    getLocalAudioStream().then(() => {
      if (!localStream.current) return;
      localStream.current.getTracks().forEach((track) => {
        if (!localStream.current) return;
        connection.addTrack(track, localStream.current);
      });
    });
  }, []);

  const sendChatMessage = () => {
    if (!dataChannelRef.current || !chatMessageInputRef.current) return;
    if (!chatMessageInputRef.current.value) return;

    const message = chatMessageInputRef.current.value;
    chatMessageInputRef.current.value = "";
    const createdAt = new Date().toISOString();

    const chatMessage = { userName, message, createdAt };

    setChatMessages((prev) => [...prev, chatMessage]);

    dataChannelRef.current.send(JSON.stringify(chatMessage));
  };

  useEffect(() => {
    if (connection.currentRemoteDescription) {
      console.log("이미 커넥션이 생성되어있음");
      return;
    }

    connection.addEventListener(
      "icecandidate",
      onPeerConnectionFoundICECandidate
    );
    connection.addEventListener(
      "icecandidateerror",
      onPeerConnectionFoundICECandidateError
    );
    connection.addEventListener(
      "connectionstatechange",
      onPeerConnectionStateChanged
    );
    connection.addEventListener(
      "datachannel",
      onPeerConnectionDataChannelOpend
    );
    connection.addEventListener("track", onPeerConnectionTrackAdded);

    return () => {
      if (dataChannelRef.current) {
        dataChannelRef.current.removeEventListener("open", onDataChannelOpen);
        dataChannelRef.current.removeEventListener("close", onDataChannelClose);
        dataChannelRef.current.removeEventListener(
          "message",
          onDataChannelMessage
        );
      }
      connection.removeEventListener(
        "icecandidate",
        onPeerConnectionFoundICECandidate
      );
      connection.removeEventListener(
        "icecandidateerror",
        onPeerConnectionFoundICECandidateError
      );
      connection.removeEventListener(
        "connectionstatechange",
        onPeerConnectionStateChanged
      );
      connection.removeEventListener(
        "datachannel",
        onPeerConnectionDataChannelOpend
      );
      connection.removeEventListener("track", onPeerConnectionTrackAdded);
    };
  }, []);

  useEffect(() => {
    socket.on("offer", async ({ offer, callerId }) => {
      console.log("got offer");
      connection.setRemoteDescription(offer);
      incomingOffer.current = { offer, callerId };

      setCallState(CallStateEnum["INCOMING CALL"]);
    });

    socket.on("answer", async (answer: RTCSessionDescriptionInit) => {
      console.log("got answer", answer);
      const remoteDesc = new RTCSessionDescription(answer);
      await connection.setRemoteDescription(remoteDesc);
    });

    socket.on("new-candidate", async (candidate: RTCIceCandidate) => {
      if (!connection.remoteDescription) return;
      console.log("got new candidate", candidate);
      await connection.addIceCandidate(candidate);
    });

    socket.on("user:new", ({ name, id }) => {
      setAvailableUsers((prev) => [
        ...prev,
        {
          name,
          id,
          state: "AVAILABLE",
        },
      ]);
    });

    socket.on("user:available", ({ name, id }) => {
      console.log(name, id);
      setAvailableUsers((prev) =>
        prev.map((user) => {
          if (user.name === name) {
            return {
              ...user,
              state: "AVAILABLE",
            };
          } else {
            return user;
          }
        })
      );
    });

    socket.on("user:unavailable", (name) => {
      setAvailableUsers((prev) =>
        prev.map((user) => {
          if (user.name === name) {
            return {
              ...user,
              state: "UNAVAILABLE",
            };
          } else {
            return user;
          }
        })
      );
    });

    socket.on("user:deleted", (name) => {
      setAvailableUsers((prev) =>
        prev.filter((availableUser) => availableUser.name !== name)
      );
    });

    socket.on("connect:reject", () => {
      setCallState(CallStateEnum.WAITING);
      alert("상대방이 연결을 거절했습니다.");
    });

    return () => {
      socket.removeAllListeners();
    };
  }, []);

  useEffect(() => {
    switch (callState) {
      case CallStateEnum.WAITING: {
        socket.emit("user:available", userName);
        break;
      }
      case CallStateEnum["MAKE CALL"]:
      case CallStateEnum["ON THE PHONE"]:
      case CallStateEnum["INCOMING CALL"]: {
        socket.emit("user:unavailable", userName);
        break;
      }
    }
  }, [callState, userName]);

  useEffect(() => {
    if (!chatViewRef.current) return;

    chatViewRef.current.scrollTo({
      top: chatViewRef.current.scrollHeight,
    });
  }, [chatMessages.length]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        flexDirection: "row",
      }}
    >
      <aside
        style={{
          display: "flex",
          height: "100%",
          flexDirection: "column",
          alignItems: "center",
          borderRight: `1px solid black`,
          padding: "16px",
          width: "150px",
        }}
      >
        <p style={{ fontSize: 14, marginBottom: 8 }}>{uri}</p>
        {userName && (
          <p style={{ fontSize: 14, marginBottom: 8 }}> 내 이름 : {userName}</p>
        )}

        {!userName && (
          <div
            style={{
              fontSize: 14,
              display: "flex",
              gap: 4,
              flexDirection: "column",
            }}
          >
            내 사용자이름 입력
            <div style={{ display: "flex", gap: 4 }}>
              <input ref={userNameInput} style={{ width: "100%" }} />
              <button
                style={{
                  alignSelf: "flex-end",
                  margin: 0,
                  fontSize: 12,
                  minWidth: 50,
                  height: "100%",
                }}
                onClick={() => {
                  if (!userNameInput.current) return;
                  const { value } = userNameInput.current;
                  if (!value) return window.alert("유저이름을 입력해주세요");
                  if (userName === value) return;
                  if (userName) {
                    socket.emit("user:deleted", userName);
                  }
                  socket.emit("user:new", value);

                  setUserName(value);
                }}
              >
                사용
              </button>
            </div>
          </div>
        )}
        <p>온라인 유저 목록</p>
        <div
          style={{
            display: "flex",
            gap: 4,
            flexDirection: "column",
            width: "100%",
          }}
        >
          {availableUsers.map((user) => (
            <div
              key={user.id}
              style={{
                width: "100%",
                border: `1px solid skyblue`,
                borderRadius: "4px",
                padding: 4,
                backgroundColor: selectedUser === user.id ? "skyblue" : "unset",
                borderColor: selectedUser === user.id ? "black" : "skyblue",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.cursor = "pointer";
                e.currentTarget.style.background = "skyblue";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.cursor = "default";
                if (selectedUser === user.id) return;
                e.currentTarget.style.background = "unset";
              }}
            >
              <p
                key={user.id}
                style={{
                  color: user.state === "AVAILABLE" ? "black" : "gray",
                  fontSize: 12,
                  margin: 0,
                }}
              >
                {user.name}
              </p>
              {user.state === "AVAILABLE" && (
                <button
                  onClick={async () => {
                    setSelectedUser(user.id);
                    socket.emit("user:join", user.id);
                    if (!dataChannelRef.current) {
                      const newDataChannel =
                        connection.createDataChannel("messages");
                      newDataChannel.addEventListener(
                        "open",
                        onDataChannelOpen
                      );
                      newDataChannel.addEventListener(
                        "close",
                        onDataChannelClose
                      );
                      newDataChannel.addEventListener(
                        "message",
                        onDataChannelMessage
                      );
                      dataChannelRef.current = newDataChannel;
                    }

                    await getLocalAudioStream();

                    const offer = await connection.createOffer({
                      offerToReceiveAudio: true,
                      offerToReceiveVideo: false,
                    });
                    await connection.setLocalDescription(offer);

                    console.log("send offer", offer);
                    socket.emit("offer", offer, user.id);
                    setCallState(CallStateEnum["MAKE CALL"]);
                  }}
                >
                  연결
                </button>
              )}
              {user.state === "UNAVAILABLE" && user.id === selectedUser && (
                <button
                  onClick={() => {
                    connection.close();
                  }}
                >
                  통화종료
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>
      <div style={{ width: "100%", height: "100%" }}>
        {callState === CallStateEnum["INCOMING CALL"] && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              overflow: "hidden",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div
              style={{
                background: "white",
                zIndex: 2,
                display: "flex",
                flexDirection: "column",
                padding: "16px",
                borderRadius: "8px",
              }}
            >
              연결 요청 수신중
              <button
                disabled={!isIncomingCall}
                onClick={async () => {
                  if (!incomingOffer.current?.callerId) return;
                  const answer = await connection.createAnswer();
                  await connection.setLocalDescription(answer);
                  await getLocalAudioStream();

                  if (!localStream.current) return;

                  localStream.current.getTracks().forEach((track) => {
                    if (!localStream.current) return;
                    connection.addTrack(track, localStream.current);
                  });

                  console.log("send answer");
                  socket.emit("answer", answer, incomingOffer.current.callerId);
                  console.log(connection);
                }}
              >
                연결하기
              </button>
              <button
                disabled={!isIncomingCall}
                onClick={async () => {
                  socket.emit(
                    "connect:reject",
                    incomingOffer.current?.callerId
                  );
                  incomingOffer.current = null;
                  setCallState(CallStateEnum.WAITING);
                }}
              >
                거절하기
              </button>
            </div>
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                overflow: "hidden",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: `rgba(0, 0, 0, 0.5)`,
              }}
            />
          </div>
        )}
        <audio ref={localAudioRef} muted />
        <audio ref={remoteAudioRef} />
        <div style={{ height: "100%" }}>
          <div
            ref={chatViewRef}
            style={{
              height: "calc(100% - 80px)",
              backgroundColor: "rgba(0, 0, 0, 0.1)",
              overflow: "auto",
              gap: "16px",
            }}
          >
            {chatMessages.map((message, index, origin) => {
              const myMessage = message.userName === userName;
              const getTime = (createdAt: string) =>
                Intl.DateTimeFormat("ko", { timeStyle: "short" }).format(
                  new Date(createdAt)
                );
              const prevMessage = origin[index - 1];
              const prevInARow = !prevMessage
                ? false
                : message.userName === prevMessage.userName &&
                  getTime(message.createdAt) === getTime(prevMessage.createdAt);
              const nextMessage = origin[index + 1];
              const nextInARow = !nextMessage
                ? false
                : message.userName === nextMessage.userName &&
                  getTime(message.createdAt) === getTime(nextMessage.createdAt);

              return (
                <div
                  key={message.createdAt}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    margin: "8px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      alignSelf: myMessage ? "flex-end" : "flex-start",
                      gap: "16px",
                      fontSize: 16,
                    }}
                  >
                    {myMessage && !nextInARow && (
                      <span style={{ fontSize: 12 }}>
                        {getTime(message.createdAt)}
                      </span>
                    )}
                    {!myMessage && (
                      <div
                        style={{
                          alignSelf: "center",
                          visibility: !prevInARow ? "visible" : "hidden",
                          minWidth: "30px",
                        }}
                      >
                        {message.userName}
                      </div>
                    )}
                    <div
                      style={{
                        borderRadius: myMessage
                          ? "4px 0px 4px 4px"
                          : "0px 4px 4px 4px",
                        background: myMessage ? "yellow" : "white",
                        padding: 12,
                        maxWidth: "250px",
                      }}
                    >
                      {message.message}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              height: "80px",
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: "8px",
              borderTop: `1px solid lightgrey`,
            }}
          >
            <input
              ref={chatMessageInputRef}
              onKeyUp={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  sendChatMessage();
                }
              }}
              style={{ width: "100%", fontSize: 16, height: "100%" }}
            />
            <button
              style={{ fontSize: 12, minWidth: "100px", height: "100%" }}
              disabled={callState !== CallStateEnum["ON THE PHONE"]}
              onClick={sendChatMessage}
            >
              보내기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

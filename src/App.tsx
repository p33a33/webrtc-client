import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { socket } from ".";
import useWebRTC from "./hooks/useWebRTC";
import { CallStateEnum, DataChannelMessage, ShareOptionEnum } from "./types";
import {
  acceptIncommingCall,
  addTrackToConnection,
  call,
  getLocalStream,
  playLocalStreamOnPlayer,
  rejectIncommingCall,
  switchScreenShareTrack,
} from "./utils";
import { send } from "process";

const uri = window.location.href;

function App() {
  const [userName, setUserName] = useState<string>("");
  const [availableUsers, setAvailableUsers] = useState<
    { name: string; state: "AVAILABLE" | "UNAVAILABLE"; id: string }[]
  >([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [callState, setCallState] = useState<CallStateEnum>(
    CallStateEnum.WAITING
  );
  const [shareOption, setShareOption] = useState<ShareOptionEnum | null>(null);
  const userNameInput = useRef<HTMLInputElement>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const incomingOffer = useRef<{
    offer: RTCSessionDescriptionInit;
    callerId: string;
  } | null>(null);
  const chatMessageInputRef = useRef<HTMLInputElement>(null);
  const [chatMessages, setChatMessages] = useState<DataChannelMessage[]>([]);
  const localPlayer = useRef<HTMLVideoElement>(null);
  const remotePlayer = useRef<HTMLVideoElement>(null);
  const {
    connection,
    closeConnection,
    createPeerConnection,
    onCreateDataChannel,
  } = useWebRTC({
    localPlayer,
    remotePlayer,
    userName,
    onReceiveChatMessage: (message: DataChannelMessage) => {
      setChatMessages((prev) => [...prev, message]);
    },
  });
  const chatViewRef = useRef<HTMLDivElement>(null);

  const isIncomingCall = callState === CallStateEnum["INCOMING CALL"];

  const addLocalTrack = useCallback(async () => {
    if (!shareOption || !connection.current || !localPlayer.current) return;
    const stream = await getLocalStream(shareOption);
    if (!stream) return;
    playLocalStreamOnPlayer(stream, localPlayer.current);
    await addTrackToConnection(stream, connection.current);
  }, [connection, shareOption]);

  const sendChatMessage = async () => {
    if (!dataChannelRef.current || !chatMessageInputRef.current) return;
    if (!chatMessageInputRef.current.value) return;
    const message = chatMessageInputRef.current.value;
    const createdAt = new Date().toISOString();
    const chatMessage = { userName, message, createdAt };

    setChatMessages((prev) => [...prev, chatMessage]);
    chatMessageInputRef.current.value = "";
    dataChannelRef.current.send(JSON.stringify(chatMessage));
  };

  const makeACall = useCallback(
    async (calleeId: string) => {
      if (!connection.current) return;
      const { current: peer } = connection;
      dataChannelRef.current = onCreateDataChannel(peer);
      call(peer, calleeId, shareOption);
      setSelectedUser(calleeId);
      setCallState(CallStateEnum["MAKE CALL"]);
    },
    [shareOption, onCreateDataChannel, connection]
  );

  useEffect(() => {
    if (shareOption) {
      addLocalTrack();
    }
  }, [shareOption, addLocalTrack]);

  // Socket Listener
  useEffect(() => {
    socket.on("offer", async ({ offer, callerId, shareOption }) => {
      if (!connection.current) return;
      console.log("got offer", offer);
      connection.current.setRemoteDescription(offer);
      incomingOffer.current = { offer, callerId };
      setShareOption(shareOption);
      setCallState(CallStateEnum["INCOMING CALL"]);
    });

    socket.on("answer", async (answer: RTCSessionDescriptionInit) => {
      console.log("got answer", answer);
      if (!connection.current) return;
      const remoteDesc = new RTCSessionDescription(answer);
      await connection.current.setRemoteDescription(remoteDesc);
    });

    socket.on("new-candidate", async (candidate: RTCIceCandidate) => {
      if (!connection.current) return;
      if (!connection.current.remoteDescription) return;
      await connection.current.addIceCandidate(candidate);
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
  }, [connection]);

  // Call State
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

  // Keep Chat View displays LastMessage
  useEffect(() => {
    if (!chatViewRef.current) return;

    chatViewRef.current.scrollTo({
      top: chatViewRef.current.scrollHeight,
    });
  }, [chatMessages.length]);

  useEffect(() => {
    if (userName) {
      createPeerConnection();
    }
  }, [userName, createPeerConnection]);

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
                  if (userName !== value) {
                    if (userName) {
                      socket.emit("user:deleted", userName);
                    }
                    socket.emit("user:new", value);
                    setUserName(value);
                  }
                }}
              >
                사용
              </button>
            </div>
          </div>
        )}
        <div>
          공유방법 선택
          <div style={{ display: "flex" }}>
            <button onClick={() => setShareOption(ShareOptionEnum.AUDIO_ONLY)}>
              마이크
            </button>
            <button onClick={() => setShareOption(ShareOptionEnum.WITH_CAMERA)}>
              카메라
            </button>
            <button
              onClick={() => setShareOption(ShareOptionEnum.WITH_DISPLAY)}
            >
              화면공유
            </button>
          </div>
        </div>

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
                <button onClick={() => makeACall(user.id)}>연결</button>
              )}
              {user.state === "UNAVAILABLE" && user.id === selectedUser && (
                <button
                  onClick={() => {
                    closeConnection();
                    socket.emit("user:available", userName);
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
                  if (!connection.current) return;
                  await acceptIncommingCall(
                    connection.current,
                    incomingOffer.current?.callerId
                  );
                  setCallState(CallStateEnum["ON THE PHONE"]);
                }}
              >
                연결하기
              </button>
              <button
                disabled={!isIncomingCall}
                onClick={async () => {
                  if (!incomingOffer.current?.callerId) return;
                  rejectIncommingCall(incomingOffer.current.callerId);
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
        <div
          style={{
            display:
              shareOption === ShareOptionEnum.WITH_DISPLAY ? "flex" : "none",
          }}
        >
          <div
            style={{
              position: "fixed",
              bottom: 30,
              right: 30,
              width: "300px",
              height: "fit-content",
              zIndex: 2,
            }}
          >
            <video ref={localPlayer} width={300} height={"auto"} />
            <button
              style={{ position: "absolute", bottom: 0, right: 0 }}
              onClick={async () => {
                const peerConnection = connection.current;
                if (!peerConnection || !localPlayer.current) return;
                await switchScreenShareTrack(
                  peerConnection,
                  localPlayer.current
                );
              }}
            >
              change view
            </button>
          </div>
          <video ref={remotePlayer} width={"auto"} height={"auto"} />
        </div>
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

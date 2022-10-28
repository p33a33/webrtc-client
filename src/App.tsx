import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
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

const uri = window.location.href;

function App() {
  const [userName, setUserName] = useState<string>("");
  const [availableUsers, setAvailableUsers] = useState<
    { name: string; state: "AVAILABLE" | "UNAVAILABLE"; id: string }[]
    >([{
      name: 'dummy',
      state: 'AVAILABLE',
      id : 'dummmmy'
  }]);
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
    <div className="flex w-screen h-screen align-center flex-row">
      <aside className="flex h-100 flex-col align-center  border-solid border-black border-1 p-4 w-1/2 gap-8 border-r">
        <p className="text-base mb-2 font-semibold">{uri}</p>
        {userName && (
          <p className="text-base mb-2 font-medium"> 내 이름 : {userName}</p>
        )}

        {!userName && (
          <div className="flex text-base gap-4 flex-col font-medium">
            내 사용자이름 입력
            <div className="flex gap-2 justify-between items-center">
              <input
                ref={userNameInput}
                className="w-full border-solid border border-black rounded-lg text-lg p-1"
              />
              <button
                className="flex m-0 text-sx p-2 w-1/4 justify-center border-lg border-solid border-indigo-500 rounded-lg bg-sky-500 text-white"
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
        <div className="flex flex-col gap-4 text-base font-medium">
          공유방법 선택
          <div className="flex self-center gap-2 text-sm font-medium w-full h-14">
            <button
              className="basis-full border border-sky-500 p-1 rounded-lg bg-sky-500 text-white"
              onClick={() => setShareOption(ShareOptionEnum.AUDIO_ONLY)}
            >
              마이크
            </button>
            <button
              className="basis-full border border-sky-500 p-1 rounded-lg bg-sky-500 text-white"
              onClick={() => setShareOption(ShareOptionEnum.WITH_CAMERA)}
            >
              카메라
            </button>
            <button
              className="basis-full border border-sky-500 p-1 rounded-lg bg-sky-500 text-white"
              onClick={() => setShareOption(ShareOptionEnum.WITH_DISPLAY)}
            >
              화면공유
            </button>
          </div>
        </div>

        <p className="text-base font-medium">온라인 유저 목록</p>
        <div
          className="flex gap-1 flex-col w-full"
        >
          {availableUsers.map((user) => (
            <div
              className={clsx(["transition-all","group","w-full", "border-sky-500", "border-solid", "border-2", "p-2", "flex", "justify-between", "items-center", "hover:cursor-pointer", "hover:bg-sky-500", "hover:border-sky-500", "rounded-xl", "text-sky-600"], {
                'bg-sky-700': selectedUser === user.id,
                'border-sky-700': selectedUser === user.id,
              })}
              key={user.id}
            >
              <p
                className={clsx(["transition-all", "text-base", "m-0", "font-semibold", "group-hover:text-white"], {
                  'text-gray-700': user.state !== 'AVAILABLE',
                })}
                key={user.id}
              >
                {user.name}
              </p>
              {user.state === "AVAILABLE" && (
                <button
                  className="border border-sky-500 p-1 px-2 rounded-lg bg-sky-500 text-white group-hover:bg-white group-hover:text-sky-500 group-hover:font-semibold"
                  onClick={() => makeACall(user.id)}
                >
                  연결가능
                </button>
              )}
              {user.state === "UNAVAILABLE" && user.id === selectedUser && (
                <button
                  className="basis-full border border-sky-500 p-1 rounded-lg bg-sky-500 text-white"
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
                className="basis-full border border-sky-500 p-1 rounded-lg bg-sky-500 text-white"
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
                className="basis-full border border-sky-500 p-1 rounded-lg bg-sky-500 text-white"
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
              className="absolute inset-0 overflow-hidden flex justify-cetner items-center"
              style={{
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
          <div className="group fixed bottom-7 right-7 w-75 z-2 h-fit">
            <video
              className="rounded-lg"
              ref={localPlayer}
              width={300}
              height={"auto"}
            />
            <div className="absolute bg-black inset-0 opacity-0 rounded-lg group-hover:opacity-30 transition-all text-white font-lg p-4 hover:cursor-pointer"
            onClick={() => {
              const thisStream = localPlayer.current?.srcObject;
              const bigStream = remotePlayer.current?.srcObject;

              if (thisStream && remotePlayer.current) {
                remotePlayer.current.autoplay = true;
                remotePlayer.current.srcObject = thisStream
              }

              if (bigStream && localPlayer.current) {
                localPlayer.current.autoplay = true
                localPlayer.current.srcObject = bigStream
              }
            }}>
              크게보기
            </div>
            <button
              className="transition-all opacity-0 absolute bottom-1 right-1 basis-full border border-sky-500 p-2 rounded-lg bg-sky-500 text-white hover:bg-sky-700 hover:border-sky-700 hover:font-medium text-sm group-hover:flex hover:group-hover:opacity-100 group-hover:opacity-40"
              onClick={async () => {
                const peerConnection = connection.current;
                if (!peerConnection || !localPlayer.current) return;
                await switchScreenShareTrack(
                  peerConnection,
                  localPlayer.current
                );
              }}
            >
              CHANGE VIEW
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

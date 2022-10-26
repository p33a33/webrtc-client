import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import { socket } from ".";

const uri = window.location.href;

function App() {
  const [userName, setUserName] = useState<string>("");
  const [availableUsers, setAvailableUsers] = useState<
    { name: string; state: "AVAILABLE" | "UNAVAILABLE"; id: string }[]
  >([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const userNameInput = useRef<HTMLTextAreaElement>(null);
  const [serverMessages, setServerMessages] = useState<string[]>([]);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  const onRecieveMessage = (message: string) => {
    console.log(message);
    setServerMessages((prev) => [...prev, message]);
  };

  const connect = async () => {
    if (peerConnection.current) {
      console.log("이미 커넥션이 생성되어있음");
      console.log(peerConnection.current);
      return;
    }

    const connection = (peerConnection.current = new RTCPeerConnection({
      iceServers: [
        {
          urls: "turn:192.168.0.17",
          username: "david",
          credential: "david",
        },
      ],
      iceTransportPolicy: "all",
    }));

    const channel = (dataChannelRef.current =
      connection.createDataChannel("messages"));

    channel.addEventListener("open", (e) => {
      console.log("data channel opened", e);
      channel.send("hey");
    });

    channel.addEventListener("close", (e) => {
      console.log("data channel closed", e);
    });

    channel.addEventListener("message", (e) => {
      console.log("message", e);
    });

    connection.addEventListener("icecandidate", (e) => {
      if (!e.candidate) return;
      console.log("find new candidate", e);
      socket.emit("new-ice-candidate", e.candidate);
    });

    connection.addEventListener("icecandidateerror", (e) => {
      console.log(e);
    });

    connection.addEventListener("connectionstatechange", (e) => {
      if (!connection) return;
      if (connection.connectionState === "connected") {
        console.log("connected");
      }
    });

    connection.addEventListener("datachannel", (e) => {
      const dataChannel = e.channel;

      dataChannel.addEventListener("open", (e) => {
        console.log("data channel opened", e);
      });

      dataChannel.addEventListener("close", (e) => {
        console.log("data channel closed", e);
      });

      dataChannel.addEventListener("message", (e) => {
        console.log(e);
      });
    });

    const offer = await connection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
    await connection.setLocalDescription(offer);

    console.log("send offer", offer);
    socket.emit("offer", offer, selectedUser);
  };

  useEffect(() => {
    socket.on("offer", async ({ offer, targetUserId }) => {
      if (!peerConnection.current) return;
      console.log("got offer");
      const connectionOffer = new RTCSessionDescription(offer);
      peerConnection.current.setRemoteDescription(connectionOffer);
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      console.log("send answer");
      socket.emit("answer", answer, targetUserId);
    });

    socket.on("answer", async (answer: RTCSessionDescriptionInit) => {
      if (!peerConnection.current) return;
      console.log("got answer", answer);
      const remoteDesc = new RTCSessionDescription(answer);
      await peerConnection.current.setRemoteDescription(remoteDesc);
    });

    socket.on("new-candidate", async (candidate: RTCIceCandidate) => {
      if (!peerConnection.current) return;
      console.log("got new candidate", candidate);
      await peerConnection.current.addIceCandidate(candidate);
    });

    socket.on("user:available", ({ name, id }) => {
      console.log(name, id);
      setAvailableUsers((prev) => [...prev, { name, state: "AVAILABLE", id }]);
    });

    socket.on("user:unavailable", (id) => {
      setAvailableUsers((prev) =>
        prev.map((user) => {
          if (user.id === id) {
            user.state = "UNAVAILABLE";
            return user;
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

    socket.on("message", onRecieveMessage);

    return () => {
      socket.removeAllListeners();
    };
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        paddingTop: 100,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <h3>{uri}</h3>
      {userName && <h4> my name : {userName}</h4>}
      {selectedUser && (
        <h4>
          {" "}
          call to :{" "}
          {availableUsers.find((user) => user.id === selectedUser)?.name}
        </h4>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          border: `1px solid black`,
          borderRadius: "8px",
          padding: "16px 24px",
          width: "50%",
        }}
      >
        <h5>available user list</h5>
        {availableUsers.map((user) => (
          <p
            key={user.name}
            style={{ color: user.state === "AVAILABLE" ? "black" : "gray" }}
            onClick={() => {
              console.log(user.id);
              setSelectedUser(user.id);
              socket.emit("user:join", user.id);
            }}
          >
            {user.name}
          </p>
        ))}
      </div>

      {/* <button
        onClick={() => {
          socket.send("hello");
        }}
      >
        send message to server
      </button> */}

      <div style={{ display: "flex", gap: 16 }}>
        <textarea ref={userNameInput} style={{ width: "100%" }} />
        <button
          onClick={() => {
            if (!userNameInput.current) return;
            const { value } = userNameInput.current;
            if (!value) return window.alert("유저이름을 입력해주세요");
            if (userName === value) return;
            if (userName) {
              socket.emit("user:deleted", userName);
            }
            socket.emit("user:available", value);

            setUserName(value);
          }}
        >
          enter
        </button>
      </div>

      <button
        disabled={!userName || Boolean(peerConnection.current)}
        onClick={async () => {
          await connect();
        }}
      >
        i wanna be connected
      </button>

      <button
        onClick={() => {
          if (!peerConnection.current) return;
          const channel = dataChannelRef.current;
          if (!channel) return;

          channel.send("hello");
        }}
      >
        send hey throw channel
      </button>

      <button
        onClick={() => {
          setServerMessages([]);
        }}
      >
        clear all messages
      </button>

      <div>
        {serverMessages.map((message, index) => (
          <p key={index}>{message}</p>
        ))}
      </div>
    </div>
  );
}

export default App;

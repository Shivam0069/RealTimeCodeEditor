"use client";
import ACTIONS from "@/Actions";
import { use, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

import Client from "@/components/Client";
import Editor from "@/components/Editor";
import Modal from "@/components/Model";
import { useUser } from "@/context/userContext";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import axios from "axios";

const EditorPage = ({ params }) => {
  const socketRef = useRef(null);
  const codeRef = useRef("");
  const router = useRouter();
  const unwrappedParams = use(params);
  const roomId = unwrappedParams.id;
  const [clients, setClients] = useState([]);
  const [initialCode, setInitialCode] = useState("");
  const { createFile, userData } = useUser();

  // Voice chat state
  const [isInVoiceChat, setIsInVoiceChat] = useState(false);
  const [isListening, setIsListening] = useState(true); // New state for listening mode
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const audioElementsRef = useRef({}); // Track audio elements for each peer
  const [fileType, setFileType] = useState("new");

  const [importedFileId, setImportedFileId] = useState("");
  const username = useRef(
    userData?.userName ||
      localStorage.getItem("username") ||
      `User-${Math.floor(Math.random() * 1000)}`
  );

  const [showImportModal, setShowImportModal] = useState(false);

  // Function to handle file import selection
  const handleFileImport = async (file) => {
    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/files/getFile/${file.fileId}`,
        {
          withCredentials: true,
        }
      );
      if (res.status == 200) {
        setInitialCode(res.data?.file?.content);
        codeRef.current = res.data?.file?.content;
        toast.success("File imported successfully");
        setFileType("imported");
        setImportedFileId(file.fileId);
      }
    } catch (error) {
      console.log("Error importing file:", error);
      toast.error("Error importing file");
    } finally {
      setShowImportModal(false);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const fileContent = e.target.result;
      setInitialCode(fileContent);

      codeRef.current = fileContent; // Update the codeRef with the file content
      setFileType("uploaded");
      socketRef.current.emit(ACTIONS.CODE_CHANGE, {
        roomId,
        code: fileContent,
      });
    };
    reader.readAsText(file); // Read the file as text
  };

  // WebRTC configuration
  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  const getOrCreatePeerConnection = (peerId) => {
    if (!peerConnectionsRef.current[peerId]) {
      const peerConnection = new RTCPeerConnection(configuration);
      peerConnectionsRef.current[peerId] = peerConnection;

      // Add local stream if it exists and we're in voice chat
      if (localStreamRef.current && isInVoiceChat) {
        localStreamRef.current.getTracks().forEach((track) => {
          peerConnection.addTrack(track, localStreamRef.current);
        });
      }

      // Handle incoming tracks
      peerConnection.ontrack = (event) => {
        if (!audioElementsRef.current[peerId]) {
          const audio = new Audio();
          audio.autoplay = true;
          audioElementsRef.current[peerId] = audio;
        }
        audioElementsRef.current[peerId].srcObject = event.streams[0];
        if (isListening) {
          audioElementsRef.current[peerId].play().catch(console.error);
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit(ACTIONS.ICE_CANDIDATE, {
            candidate: event.candidate,
            to: peerId,
          });
        }
      };
    }
    return peerConnectionsRef.current[peerId];
  };

  useEffect(() => {
    const init = async () => {
      socketRef.current = io(process.env.NEXT_PUBLIC_BACKEND_URL);

      socketRef.current.on("connect_error", (err) => handleErrors(err));
      socketRef.current.on("connect_failed", (err) => handleErrors(err));

      function handleErrors(e) {
        toast.error("Socket connection failed, try again later.");
        router.push("/");
      }

      socketRef.current.emit(ACTIONS.JOIN, {
        roomId,
        username: username.current,
      });

      // Existing socket handlers...
      socketRef.current.on(
        ACTIONS.JOINED,
        ({ clients, username, socketId }) => {
          if (username !== username.current) {
            toast.success(`${username} joined the room.`);
          }
          setClients(clients);
          socketRef.current.emit(ACTIONS.SYNC_CODE, {
            code: codeRef.current,
            socketId,
          });
        }
      );

      // Voice chat handlers
      socketRef.current.on(ACTIONS.VOICE_OFFER, async ({ offer, from }) => {
        const peerConnection = getOrCreatePeerConnection(from);
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(offer)
        );
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socketRef.current.emit(ACTIONS.VOICE_ANSWER, {
          answer,
          to: from,
        });
      });

      socketRef.current.on(ACTIONS.VOICE_ANSWER, async ({ answer, from }) => {
        const pc = peerConnectionsRef.current[from];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      });

      socketRef.current.on(
        ACTIONS.ICE_CANDIDATE,
        async ({ candidate, from }) => {
          const pc = peerConnectionsRef.current[from];
          if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        }
      );

      socketRef.current.on("voice-chat-users-updated", ({ clients }) => {
        setClients(clients);
      });
    };

    if (roomId) {
      init();
    }

    return () => {
      // Cleanup
      Object.values(audioElementsRef.current).forEach((audio) => {
        audio.srcObject = null;
        audio.remove();
      });
      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      socketRef.current?.disconnect();
    };
  }, [roomId]);

  const toggleListening = () => {
    setIsListening(!isListening);
    Object.values(audioElementsRef.current).forEach((audio) => {
      if (!isListening) {
        audio.play().catch(console.error);
      } else {
        audio.pause();
      }
    });
  };

  const toggleVoiceChat = async () => {
    try {
      if (!isInVoiceChat) {
        // Start voice chat
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        localStreamRef.current = stream;

        // Add tracks to existing peer connections
        Object.entries(peerConnectionsRef.current).forEach(([peerId, pc]) => {
          stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream);
          });
        });

        // Notify other users
        socketRef.current.emit(ACTIONS.START_VOICE_CHAT, { roomId });

        // Create new connections with voice chat users
        clients.forEach((client) => {
          if (client.isInVoiceChat && client.id !== socketRef.current?.id) {
            const pc = getOrCreatePeerConnection(client.id);
            pc.createOffer().then((offer) => {
              pc.setLocalDescription(offer).then(() => {
                socketRef.current.emit(ACTIONS.VOICE_OFFER, {
                  offer,
                  to: client.id,
                });
              });
            });
          }
        });
      } else {
        // Stop voice chat but maintain listening connections
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => track.stop());
          localStreamRef.current = null;
        }

        // Remove local tracks from peer connections but keep connections alive
        Object.values(peerConnectionsRef.current).forEach((pc) => {
          pc.getSenders().forEach((sender) => {
            pc.removeTrack(sender);
          });
        });

        socketRef.current.emit(ACTIONS.END_VOICE_CHAT, { roomId });
      }

      setIsInVoiceChat(!isInVoiceChat);
    } catch (error) {
      toast.error("Error accessing microphone");
      console.error("Error accessing microphone:", error);
    }
  };

  async function copyRoomId() {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success("Room ID copied to clipboard");
    } catch (err) {
      toast.error("Could not copy the Room ID");
    }
  }

  function leaveRoom() {
    if (socketRef.current) {
      socketRef.current.emit(ACTIONS.LEAVE);
      socketRef.current.disconnect();
    }
    router.push("/profile");
  }

  function downloadHandler() {
    if (!codeRef.current) {
      toast.error("No code to download");
      return;
    }

    // Prompt user for file name and type
    const fileName = prompt("Enter file name (without extension):", "code");
    if (!fileName) return; // If user cancels, stop execution

    const fileType = prompt(
      "Enter file extension (e.g., txt, js, py, cpp):",
      ".txt"
    );
    if (!fileType) return; // If user cancels, stop execution

    const validExtensions = [".txt", ".js", ".py", ".cpp"];
    if (!validExtensions.includes(fileType)) {
      toast.error("Invalid file type. Please enter a valid extension.");
      return;
    }

    const blob = new Blob([codeRef.current], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.${fileType}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const saveCodeHandler = async () => {
    if (fileType === "imported") {
      console.log("id", importedFileId);

      try {
        const res = await axios.put(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/files/update`,
          {
            fileId: importedFileId,
            content: codeRef.current,
          },
          { withCredentials: true }
        );
        if (res.status == 200) {
          toast.success("File updated successfully");
        }
      } catch (error) {
        console.error(error);
        toast.error("Error updating file");
      }
      return;
    }
    const content = codeRef.current;
    if (!codeRef.current) {
      toast.error("No code to save");
      return;
    }

    // Prompt user for file name and type
    const fileName = prompt("Enter file name (without extension):", "code");
    if (!fileName) return; // If user cancels, stop execution

    const extension = prompt(
      "Enter file extension (e.g., .txt, .js, .py, .cpp):",
      "txt"
    );
    if (!extension) return; // If user cancels, stop execution

    const validExtensions = [".txt", ".js", ".py", ".cpp"];
    if (!validExtensions.includes(extension)) {
      toast.error("Invalid file type. Please enter a valid extension.");
      return;
    }
    const fileData = { name: fileName, content: content, extension: extension };
    console.log("fileData", fileData);

    try {
      const res = await createFile(fileData);
      if (res) toast.success("File saved successfully");
    } catch (error) {
      toast.error("Error saving file");
      console.error("Error saving file:", error);
    }
  };

  return (
    <div className="mainWrap relative w-full h-screen">
      <div className="absolute bottom-10 right-4 z-40 flex space-x-2">
        {/* Import Button - New */}
        <button
          onClick={() => setShowImportModal(true)}
          className="bg-purple-600 text-white px-4 py-2 rounded-md shadow-md hover:bg-purple-700 transition"
        >
          Import
        </button>

        {/* Upload Button */}
        <label
          htmlFor="fileInput"
          className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-md shadow-md hover:bg-blue-700 transition"
        >
          Upload File
        </label>
        <input
          id="fileInput"
          type="file"
          accept=".txt,.cpp,.py,.js"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Download Button */}
        <button
          onClick={downloadHandler}
          className="bg-green-600 text-white px-4 py-2 rounded-md shadow-md hover:bg-green-700 transition"
        >
          Download
        </button>

        {/* Save Button */}
        <button
          onClick={saveCodeHandler}
          className="bg-yellow-600 text-white px-4 py-2 rounded-md shadow-md hover:bg-yellow-700 transition"
        >
          Save
        </button>
      </div>

      <div className="aside">
        <div className="asideInner">
          <h3>Connected Users</h3>
          <div className="clientsList">
            {clients.map((client) => (
              <Client
                key={client.id}
                username={client.username}
                isInVoiceChat={client.isInVoiceChat}
                onVoiceToggle={
                  client.id === socketRef.current?.id
                    ? toggleVoiceChat
                    : undefined
                }
                isListening={isListening}
                onListeningToggle={
                  client.id === socketRef.current?.id
                    ? toggleListening
                    : undefined
                }
                isSelf={client.id === socketRef.current?.id}
              />
            ))}
          </div>
        </div>
        <button className="btn copyBtn" onClick={copyRoomId}>
          Copy Room ID
        </button>
        <button className="btn leaveBtn" onClick={leaveRoom}>
          Leave Room
        </button>
      </div>
      <div className="editorWrap">
        <Editor
          socketRef={socketRef}
          roomId={roomId}
          onCodeChange={(code) => {
            codeRef.current = code;
          }}
          initialCode={initialCode}
        />
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <Modal
          title="Import from Saved Files"
          onClose={() => setShowImportModal(false)}
        >
          <div className="overflow-y-auto max-h-64 scroll-smooth scrollbar-hide">
            {userData?.files.length > 0 ? (
              <div className="grid gap-2">
                {userData?.files.map((file, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleFileImport(file)}
                    className="flex justify-between items-center p-3 bg-gray-100 rounded-md hover:bg-gray-200 cursor-pointer transition"
                  >
                    <div className="flex items-center">
                      <span className="text-lg font-medium">
                        {file?.name}
                        {file?.extension}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {new Date(file?.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p>No saved files found.</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default EditorPage;

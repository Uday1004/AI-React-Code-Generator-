import React, { useEffect, useRef, useState } from "react";
import { Sandpack } from "@codesandbox/sandpack-react";
import "../Component/Live.css";
import { githubLight } from "@codesandbox/sandpack-themes";
import { basicSetup } from "@codemirror/basic-setup";
import { autocompletion } from "@codemirror/autocomplete";
import { ToastContainer, toast } from "react-toastify";
import WelcomeCard from "./Card";

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d="M4 5h16v10H8l-4 4V5zm2 2v7.17L7.17 13H18V7H6z"
      fill="currentColor"
    />
  </svg>
);

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d="M5 20h14v-2H5v2zm7-16v8.17l2.59-2.58L16 11l-4 4-4-4 1.41-1.41L11 12.17V4h1z"
      fill="currentColor"
    />
  </svg>
);

function Live() {
  const [code, setCode] = useState("");
  const [prompt, setPrompt] = useState("");
  const [editInstruction, setEditInstruction] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [userName, setUserName] = useState("Guest");
  const [dependencies, setDependencies] = useState({});
  const [sessionId, setSessionId] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [versions, setVersions] = useState([]);
  const [activeVersion, setActiveVersion] = useState(0);
  const typingTimerRef = useRef(null);

  // ✅ Load stored username on mount
  useEffect(() => {
    const storedName = localStorage.getItem("PRoCodeUsername");
    if (storedName) {
      setUserName(storedName);
    }
  }, []);

  // ✅ Listen for name updates in localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      const updatedName = localStorage.getItem("PRoCodeUsername");
      if (updatedName) {
        setUserName(updatedName);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const cleanGeneratedCode = (rawCode) => {
    if (!rawCode) return "";
    let cleaned = rawCode.replace(/```jsx|```javascript|```/g, "").trim();
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1);
    }
    return cleaned;
  };

  const buildDependencies = (depList = [], codeText = "") => {
    if (depList.length > 0) {
      return depList.reduce((acc, dep) => {
        acc[dep] = "latest";
        return acc;
      }, {});
    }
    return extractDependencies(codeText);
  };

  const saveVersion = (data, finalCode) => {
    setVersions((prev) => {
      const nextVersion = {
        id: `v-${Date.now()}`,
        label: `v${prev.length + 1}`,
        title: data.title || "Generated Component",
        summary: data.summary || "",
        code: finalCode,
        dependencies: buildDependencies(data.dependencies || [], finalCode),
        model: data.model || "",
      };
      const updated = [...prev, nextVersion];
      setActiveVersion(updated.length - 1);
      return updated;
    });
  };

  const stopTypewriter = () => {
    if (typingTimerRef.current) {
      window.clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    setIsTyping(false);
  };

  const startTypewriter = (finalCode, nextDependencies = {}) => {
    stopTypewriter();
    setShowEditor(true);
    setDependencies(nextDependencies);
    setCode("");
    setIsTyping(true);

    const chunkSize = Math.max(3, Math.floor(finalCode.length / 260));
    let index = 0;

    typingTimerRef.current = window.setInterval(() => {
      index += chunkSize;
      const partial = finalCode.slice(0, index);
      setCode(partial);

      if (index >= finalCode.length) {
        stopTypewriter();
        setCode(finalCode);
      }
    }, 10);
  };

  const applyGeneratedResult = (data, userMessage) => {
    const cleanedCode = cleanGeneratedCode(data.code || "");
    if (!cleanedCode) {
      throw new Error("No code returned by API.");
    }

    const nextDependencies = buildDependencies(data.dependencies || [], cleanedCode);
    startTypewriter(cleanedCode, nextDependencies);

    if (data.session_id) {
      setSessionId(data.session_id);
    }

    saveVersion(data, cleanedCode);

    setChatHistory((prev) => [
      ...prev,
      { role: "user", content: userMessage },
      { role: "assistant", content: data.summary || data.title || "Code generated." },
    ]);
  };

  const parseErrorMessage = async (response) => {
    try {
      const err = await response.json();
      if (err?.detail) return err.detail;
      if (err?.message) return err.message;
    } catch (_err) {
      // Fallback to generic below.
    }
    return `HTTP error! Status: ${response.status}`;
  };

  const parseSseBlocks = (buffer) => {
    const blocks = buffer.split("\n\n");
    const completed = blocks.slice(0, -1);
    const remainder = blocks[blocks.length - 1] || "";

    const events = completed
      .map((block) => {
        const lines = block.split("\n");
        let event = "message";
        const dataLines = [];
        lines.forEach((line) => {
          if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        });
        if (!dataLines.length) return null;
        let payload = {};
        try {
          payload = JSON.parse(dataLines.join("\n"));
        } catch (_err) {
          payload = { raw: dataLines.join("\n") };
        }
        return { event, payload };
      })
      .filter(Boolean);

    return { events, remainder };
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast.warning("Please enter a prompt.");
      return;
    }

    stopTypewriter();
    setShowEditor(true);
    setCode("");
    setDependencies({});
    setIsFetching(true);
    setIsTyping(false);

    try {
      const response = await fetch("http://localhost:8010/prompt/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          session_id: sessionId || undefined,
          chat_history: chatHistory,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      if (!response.body) {
        throw new Error("Streaming is not supported by this browser.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let streamedCode = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = parseSseBlocks(buffer);
        buffer = remainder;

        for (const evt of events) {
          if (evt.event === "status") {
            if (evt.payload?.session_id) {
              setSessionId(evt.payload.session_id);
            }
            continue;
          }

          if (evt.event === "chunk") {
            const text = evt.payload?.text || "";
            if (!text) continue;
            streamedCode += text;
            setIsFetching(false);
            setIsTyping(true);
            setCode(cleanGeneratedCode(streamedCode));
            continue;
          }

          if (evt.event === "done") {
            setIsTyping(false);
            const data = evt.payload || {};
            if (data.success === false && data.error_type === "dependency_violation") {
              toast.warning(
                `External dependency blocked: ${(
                  data.missing_dependencies || []
                ).join(", ")}`
              );
            }

            const finalCode = cleanGeneratedCode(data.code || streamedCode);
            setCode(finalCode);
            const nextDependencies = buildDependencies(data.dependencies || [], finalCode);
            setDependencies(nextDependencies);

            if (data.session_id) {
              setSessionId(data.session_id);
            }

            saveVersion(data, finalCode);
            setChatHistory((prev) => [
              ...prev,
              { role: "user", content: prompt },
              {
                role: "assistant",
                content: data.summary || data.title || "Code generated.",
              },
            ]);
            continue;
          }

          if (evt.event === "error") {
            throw new Error(evt.payload?.message || "Streaming generation failed.");
          }
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setIsTyping(false);
      toast.error(`Failed to generate code: ${error.message}`);
      if (versions.length === 0) {
        setShowEditor(false);
      }
    } finally {
      setIsFetching(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!editInstruction.trim()) {
      toast.warning("Please enter instruction for changing current code.");
      return;
    }
    if (!code.trim()) {
      toast.warning("No current code found. Generate code first.");
      return;
    }

    setIsFetching(true);
    try {
      const response = await fetch("http://localhost:8010/prompt/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId || undefined,
          edit_instruction: editInstruction,
          current_code: versions[activeVersion]?.code || code,
          chat_history: chatHistory,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      const data = await response.json();

      if (data.success === false && data.error_type === "dependency_violation") {
        toast.warning(
          `External dependency blocked: ${(
            data.missing_dependencies || []
          ).join(", ")}`
        );
      }

      applyGeneratedResult(data, editInstruction);
      setEditInstruction("");
      toast.success("Code updated.");
    } catch (error) {
      console.error("Error updating code:", error);
      toast.error(`Failed to update code: ${error.message}`);
    } finally {
      setIsFetching(false);
    }
  };

  const handleNewChat = () => {
    setPrompt("");
    setEditInstruction("");
    setCode("");
    setDependencies({});
    setShowEditor(false);
    setIsFetching(false);
    stopTypewriter();
    setSessionId("");
    setChatHistory([]);
    setVersions([]);
    setActiveVersion(0);
    toast.info("Started a new chat session.");
  };

  const handleDownloadCode = () => {
    const downloadableCode = versions[activeVersion]?.code || code;
    if (!downloadableCode) {
      toast.warning("No code available to download.");
      return;
    }

    const safeName = (versions[activeVersion]?.title || "GeneratedComponent")
      .replace(/[^a-zA-Z0-9-_]/g, "")
      .slice(0, 40);
    const fileName = `${safeName || "GeneratedComponent"}.jsx`;

    const blob = new Blob([downloadableCode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const switchVersion = (index) => {
    const selected = versions[index];
    if (!selected) return;
    stopTypewriter();
    setActiveVersion(index);
    setCode(selected.code);
    setDependencies(selected.dependencies || {});
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ✅ Extract dependencies dynamically from generated code
  const extractDependencies = (code) => {
    const importRegex = /import\s+.*?\s+from\s+["']([^"']+)["']/g;
    let match;
    const dependencies = {};

    while ((match = importRegex.exec(code)) !== null) {
      const packageName = match[1].split("/")[0]; // Extract package name
      if (!packageName.startsWith(".")) {
        dependencies[packageName] = "latest"; // ✅ Set dependencies to latest version
      }
    }
    return dependencies;
  };

  useEffect(() => {
    return () => stopTypewriter();
  }, []);

  return (
    <>
      <div className="live-container">
        <WelcomeCard />
        <ToastContainer />
        {!showEditor && (
          <>
            <div className="container">
              <div className="display-3 text-center mb-5 animated-text">
                Hello {userName}
              </div>
            </div>
            <div className="prompt-container">
              <input
                type="text"
                placeholder="Enter your prompt..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="prompt-input"
                onKeyDown={handleKeyDown}
              />
              <button onClick={handleSubmit} className="submit-button">
                Generate
              </button>
            </div>
          </>
        )}

        {showEditor && (
            <div className="sandpack-container animate">
              <div className="editor-toolbar">
                <button className="toolbar-btn secondary" onClick={handleNewChat}>
                  <ChatIcon />
                  <span>New Chat</span>
                </button>
                <button className="toolbar-btn" onClick={handleDownloadCode}>
                  <DownloadIcon />
                  <span>Download Code</span>
                </button>
              </div>

              {(isFetching || isTyping) && (
                <div className="typing-status">
                  {isFetching ? "Thinking..." : "Writing code..."}
                </div>
              )}

              {isFetching && !isTyping && !code && (
                <div className="agent-writing-card">
                  <div className="agent-writing-title">Agent is writing your code</div>
                  <div className="agent-writing-subtitle">
                    Planning component structure, hooks, and JSX...
                  </div>
                  <div className="writing-lines">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}

              <div className="edit-container">
                <input
                  type="text"
                  placeholder="Make changes to current code (e.g. add dark mode toggle)"
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  className="edit-input"
                />
                <button className="edit-button" onClick={handleEditSubmit}>
                  Apply Changes
                </button>
              </div>

              {versions.length > 0 && (
                <div className="version-strip">
                  {versions.map((item, index) => (
                    <button
                      key={item.id}
                      className={`version-pill ${activeVersion === index ? "active" : ""}`}
                      onClick={() => switchVersion(index)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}

              <Sandpack
                template="react"
                theme={githubLight}
                customSetup={{
                  dependencies: dependencies,
                }}
                files={{
                  "/App.js": { code: code || "export default function App(){ return null; }", active: true },
                }}
                options={{
                  showNavigator: true,
                  showLineNumbers: true,
                  extensions: [basicSetup, autocompletion()],
                  editorHeight: 500,
                  editorWidthPercentage: 60,
                }}
              />
            </div>
          )}
      </div>
    </>
  );
}

export default Live;

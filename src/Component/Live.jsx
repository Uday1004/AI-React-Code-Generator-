import React, { useEffect, useState } from "react";
import { HashLoader } from "react-spinners";
import { Sandpack } from "@codesandbox/sandpack-react";
import "../Component/Live.css";
import { githubLight } from "@codesandbox/sandpack-themes";
import { basicSetup } from "@codemirror/basic-setup";
import { autocompletion } from "@codemirror/autocomplete";
import { ToastContainer, toast } from "react-toastify";
import WelcomeCard from "./Card";

function Live() {
  const [code, setCode] = useState("");
  const [prompt, setPrompt] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState("Guest");
  const [dependencies, setDependencies] = useState({});

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

  const runAnimation = () => {
    const inputContainer = document.querySelector(".prompt-container");
    const textAnimation = document.querySelector(".animated-text");
    if (textAnimation) textAnimation.style.opacity = "0";
    if (inputContainer) {
      inputContainer.style.transition =
        "transform 0.5s ease-in-out, opacity 0.5s";
      inputContainer.style.transform = "translateY(-100px)";
      inputContainer.style.opacity = "0";
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast.warning("Please enter a prompt.");
      return;
    }

    runAnimation();
    setTimeout(() => setLoading(true), 800);

    setTimeout(async () => {
      setShowEditor(true);

      try {
        const response = await fetch(
          "http://localhost:8010/prompt",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        let cleanedCode = cleanGeneratedCode(data.code);

        setCode(cleanedCode);
        setDependencies(extractDependencies(cleanedCode)); // ✅ Extract and set dependencies
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error(
          <div className="d-flex justify-content-between align-items-center">
            <span>Failed to generate code. Please try again.</span>
            <input
              className="btn btn-outline-danger btn-sm ms-auto mt-4"
              type="submit"
              value="Try Again"
              onClick={() => window.location.reload()}
            />
          </div>
        );
      } finally {
        setLoading(false);
      }
    }, 500);
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

        {loading ? (
          <>
            <HashLoader
              color={"#e2cdff"}
              loading={loading}
              size={55}
              aria-label="Loading Spinner"
              data-testid="loader"
            />
            <div
              style={{
                color: "#e2cdff",
                fontFamily: "cursive",
                fontSize: "1.5rem",
                marginTop: "1.5rem",
              }}
            >
              Wait for the magic..🌟
            </div>
          </>
        ) : (
          showEditor &&
          code && (
            <div className="sandpack-container animate">
              <Sandpack
                template="react"
                theme={githubLight}
                customSetup={{
                  dependencies: dependencies, // ✅ Set extracted dependencies dynamically
                }}
                files={{
                  "/App.js": { code: code, active: true },
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
          )
        )}
      </div>
    </>
  );
}

export default Live;

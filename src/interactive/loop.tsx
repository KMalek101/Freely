import React, { useState } from "react";
import { render, Box, Text, useApp, useWindowSize } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { askAI, analyzeScreenshot } from "../services/ai.js";
import { takeScreenshot } from "../services/screenshot.js";

type Message =
  | { type: "user"; content: string }
  | { type: "ai"; content: string }
  | { type: "error"; content: string };

function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const { rows } = useWindowSize();

  const handleSubmit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isWaiting) return;

    if (trimmed === "/exit") {
      process.exit(0);
      return;
    }

    if (trimmed === "/help") {
      setMessages((prev) => [
        ...prev,
        {
          type: "ai" as const,
          content: "Commands: /help, /exit, /screenshot [question]",
        },
      ]);
      return;
    }

    if (trimmed.startsWith("/screenshot")) {
      const question = trimmed.replace("/screenshot", "").trim();
      setMessages((prev) => [
        ...prev,
        { type: "user" as const, content: trimmed },
      ]);
      setInput("");
      setIsWaiting(true);
      try {
        const path = await takeScreenshot();
        let fullContent = "";
        for await (const chunk of analyzeScreenshot(path, question)) {
          fullContent += chunk;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.type === "ai") {
              next[next.length - 1] = {
                type: "ai" as const,
                content: fullContent,
              };
            } else {
              next.push({ type: "ai" as const, content: fullContent });
            }
            return next;
          });
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        setMessages((prev) => [
          ...prev,
          { type: "error" as const, content: errMsg },
        ]);
      } finally {
        setIsWaiting(false);
      }
      return;
    }

    setMessages((prev) => [
      ...prev,
      { type: "user" as const, content: trimmed },
    ]);
    setInput("");
    setIsWaiting(true);

    try {
      let fullContent = "";
      for await (const chunk of askAI(trimmed)) {
        fullContent += chunk;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.type === "ai") {
            next[next.length - 1] = {
              type: "ai" as const,
              content: fullContent,
            };
          } else {
            next.push({ type: "ai" as const, content: fullContent });
          }
          return next;
        });
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [
        ...prev,
        { type: "error" as const, content: errMsg },
      ]);
    } finally {
      setIsWaiting(false);
    }
  };

  return (
    <Box flexDirection="column" height={rows}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={0}>
        <Text bold color="cyan">
          FREELY
        </Text>
        <Text color="gray">  ·  AI Screen Assistant</Text>
      </Box>

      <Box flexGrow={1} flexDirection="column" paddingY={1}>
        {messages.map((msg, i) => {
          switch (msg.type) {
            case "user":
              return (
                <Box key={i} marginBottom={1}>
                  <Text color="cyan">›  </Text>
                  <Text>{msg.content}</Text>
                </Box>
              );
            case "ai":
              return (
                <Box key={i} marginBottom={1} paddingLeft={3}>
                  <Text color="gray">{msg.content}</Text>
                </Box>
              );
            case "error":
              return (
                <Box key={i} marginBottom={1} paddingLeft={3}>
                  <Text color="red">✕ {msg.content}</Text>
                </Box>
              );
          }
        })}
        {isWaiting && (
          <Box marginBottom={1} paddingLeft={3}>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text color="gray"> Thinking…</Text>
          </Box>
        )}
      </Box>

      <Box>
        <Text color="cyan">❯ </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Type a message..."
        />
      </Box>
    </Box>
  );
}

export async function startInteractiveLoop() {
  process.stdout.write("\x1b[?1049h");
  process.stdout.write("\x1b[2J\x1b[H");

  process.on("exit", () => process.stdout.write("\x1b[?1049l"));
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));

  const { waitUntilExit } = render(<Chat />);
  await waitUntilExit();
  process.exit(0);
}

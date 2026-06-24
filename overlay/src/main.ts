const messagesDiv = document.getElementById("messages")!;

const eventSource = new EventSource("http://localhost:3001/events");

eventSource.onmessage = (event) => {
  console.log("Raw event received:", event.data);
  const data = JSON.parse(event.data);
  const p = document.createElement("p");
  p.textContent = `[${data.type}]: ${data.content}`;
  messagesDiv.appendChild(p);
};

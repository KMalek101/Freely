const messagesDiv = document.getElementById("messages")!;

const eventSource = new EventSource("http://localhost:3001/events");

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  const p = document.createElement("p");
  p.textContent = `Type: ${data.type}, Content: ${data.content}`;
  messagesDiv.appendChild(p);
};

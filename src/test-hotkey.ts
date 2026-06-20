import { GlobalKeyboardListener } from "node-global-key-listener";

const listener = new GlobalKeyboardListener();

console.log("Listening...");

listener.addListener((e) => {
  console.log(e);
});

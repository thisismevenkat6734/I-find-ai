import * as ort from "onnxruntime-web";

let session = null;

self.addEventListener("message", async (event) => {
  const { type, id } = event.data || {};

  if (type === "INIT") {
    try {
      self.postMessage({
        type: "STATUS",
        id,
        message: "ONNX Runtime loaded. Waiting for verified model."
      });
    } catch (error) {
      self.postMessage({
        type: "ERROR",
        id,
        message: error.message
      });
    }
  }

  if (type === "CHECK_RUNTIME") {
    self.postMessage({
      type: "RUNTIME_READY",
      id,
      wasmAvailable: Boolean(ort.InferenceSession)
    });
  }
});

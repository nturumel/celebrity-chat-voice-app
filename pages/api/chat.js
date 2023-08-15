import nextConnect from "next-connect";
import multer from "multer";
import { exec } from "child_process";
import getConfig from "next/config";
import os from "os"; // 1. Import the os module
import path from "path";
import fs from "fs";
const { Configuration, OpenAIApi } = require("openai");

const upload = multer({
  storage: multer.diskStorage({
    destination: "public/chat",
    filename: (req, file, cb) => cb(null, `tmp-${file.originalname}`),
  }),
});

const apiRoute = nextConnect({
  onError(error, req, res) {
    res.status(501).json({ error: `Some error '${error}' happen` });
  },
  onNoMatch(req, res) {
    res.status(405).json({ error: `Method '${req.method}' not allowed` });
  },
});

const uploadMiddleware = upload.single("file");

apiRoute.use(uploadMiddleware);

const { serverRuntimeConfig } = getConfig();

apiRoute.post(async (req, res) => {
  console.log(`Request: ${JSON.stringify(req.body)}`);
  const text = JSON.parse(req.body.text).text;
  console.log(`Text: ${text}`);

  const filename = "tmp.mp4";
  const outputDir = serverRuntimeConfig.PROJECT_ROOT + "/public/chat";
  let outputFileName = path.join(outputDir, filename);
  let relativeFilePath = `/chat/${filename}`;

  // 2. Check if the platform is Windows
  if (os.platform() === "win32") {
    // 3. Adjust the file paths
    outputFileName = outputFileName.replace(/\//g, "\\");
    relativeFilePath = relativeFilePath.replace(/\//g, "\\");
    // Remove surrounding single quotes for Windows paths
  }

  try {
    const celebResponse = await chatWithCeleb(text);
    await textToSpeech(outputFileName, celebResponse);
    res.send({
      status: 200,
      file: relativeFilePath,
    });
  } catch (err) {
    console.log(err);
    res.send({ status: 300, error: err, out: null, file: null });
  }
});

export default apiRoute;

export const config = {
  api: {
    bodyParser: false,
  },
};

async function chatWithCeleb(text) {
  const prompt = `
Imagine you are ${process.env.CELEBRITY}.
Respond to the following input.

Input:
${text}
`;
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);

  const chatCompletion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
  });

  console.log(chatCompletion.data.choices[0].message);

  return chatCompletion.data.choices[0].message.content;
}

async function textToSpeech(outputFileName, text) {
  const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/f2VrQO4yaw7SmaqWEG9l`;
  const apiKey = process.env.ELEVEN_LABS_API_KEY;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      accept: "audio/mpeg",
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: text,
      model_id: "eleven_monolingual_v1",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  //   const blob = await response.blob();
  //   const url = window.URL.createObjectURL(blob);

  //   const a = document.createElement("a");
  //   a.style.display = "none";
  //   a.href = url;
  //   a.download = outputFileName;

  //   document.body.appendChild(a);
  //   a.click();

  //   window.URL.revokeObjectURL(url);

  // Get the audio buffer
  const audioBuffer = await response.buffer();

  // Ensure the directory exists
  const dir = path.dirname(outputFileName);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Save the audio buffer to a server-side file
  fs.writeFileSync(outputFileName, audioBuffer);
  return outputFileName;
}

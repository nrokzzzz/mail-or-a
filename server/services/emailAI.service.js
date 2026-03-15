const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

exports.classifyEmail = async (subject, body) => {
  try {
    const interaction = await ai.interactions.create({
      model: "gemini-2.0-flash",
      // Notice the field name change: 'response_json_schema'
      response_mime_type: "application/json",
      response_json_schema: {
        type: "OBJECT",
        properties: {
          category: { 
            type: "STRING", 
            enum: ["job", "internship", "hackathon", "interview", "other"] 
          },
          deadline: { type: "STRING", nullable: true }
        },
        required: ["category", "deadline"]
      },
      input: `
        Classify this email.
        Subject: ${subject}
        Body: ${body}
      `,
    });

    // interactions.create returns an object where the text is in 'outputs'
    const lastOutput = interaction.outputs[interaction.outputs.length - 1];
    
    return JSON.parse(lastOutput.text);

  } catch (error) {
    console.error("Gemini Classification Error:", error.message);
    throw error;
  }
};
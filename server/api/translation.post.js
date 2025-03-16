// server/api/openai.js

import OpenAI from 'openai';

const aiUrlOptions = {
    'DeepSeek': 'https://api.deepseek.com',
}
export default defineEventHandler(async (event) => {
    try {


        let { text, apiKey, ai, model,targetLanguage } = await readBody(event)
        const openai = new OpenAI({
            baseURL: aiUrlOptions[ai],
            apiKey: apiKey,
            temperature: 1.3
        });
        // 使用 OpenAI API 获取聊天内容
        const completion = await openai.chat.completions.create({
            model: model,
            messages: [
                { role: 'system', content: `You are a translation robot, translate the contents of the json array into ${targetLanguage}. Only return valid JSON. Do not use Markdown, do not wrap with triple backticks, and do not add any extra text.` },
                { role: 'user', content: `["Hello, '{{0}}'!","你好"]` },
                { role: 'assistant', content: `["你好,'{{0}}'!","Hello"]` },
                { role: 'user', content: JSON.stringify(text) },
            ],
        });

        // 确保响应是有效的 JSON
        let messageContent;
        try {
            messageContent = JSON.parse(completion.choices[0].message.content);
        } catch (parseError) {
            console.error('Error parsing OpenAI completion:', parseError);
            return {
                error: 'An error occurred while parsing the OpenAI completion.',
                code: 500,
            };
        }

        // 返回聊天结果
        return {
            message: messageContent,
            code: 200,
        };
    } catch (error) {
        console.error('Error fetching OpenAI completion:', error);
        return {
            error: 'An error occurred while fetching the OpenAI completion.',
            code: 500,
        };
    }
});

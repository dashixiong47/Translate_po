// server/api/translation.js

import OpenAI from 'openai';

const aiUrlOptions = {
    'DeepSeek': 'https://api.deepseek.com',
    'OpenAI': 'https://api.openai.com/v1',
}

/**
 * 清理AI响应内容,提取纯JSON
 */
function cleanJsonResponse(content) {
    if (!content) return null;
    
    // 移除可能的markdown代码块
    content = content.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    content = content.replace(/^```\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    
    // 清理前后空白
    content = content.trim();
    
    // 尝试提取JSON数组
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
        content = jsonMatch[0];
    }
    
    return content;
}

/**
 * 验证翻译结果的有效性
 */
function validateTranslation(original, translated) {
    if (!Array.isArray(translated)) {
        return { valid: false, error: 'Response is not an array' };
    }
    
    if (original.length !== translated.length) {
        return { 
            valid: false, 
            error: `Array length mismatch: expected ${original.length}, got ${translated.length}` 
        };
    }
    
    return { valid: true };
}

/**
 * 获取语言的示例文本
 */
function getLanguageExample(language) {
    const examples = {
        'Simplified Chinese': { from: 'Hello', to: '你好' },
        'Traditional Chinese': { from: 'Hello', to: '你好' },
        'Japanese': { from: 'Hello', to: 'こんにちは' },
        'Korean': { from: 'Hello', to: '안녕하세요' },
        'French': { from: 'Hello', to: 'Bonjour' },
        'German': { from: 'Hello', to: 'Hallo' },
        'Spanish': { from: 'Hello', to: 'Hola' },
        'Portuguese': { from: 'Hello', to: 'Olá' },
        'Russian': { from: 'Hello', to: 'Привет' },
        'Italian': { from: 'Hello', to: 'Ciao' },
        'Arabic': { from: 'Hello', to: 'مرحبا' },
        'Thai': { from: 'Hello', to: 'สวัสดี' },
        'Vietnamese': { from: 'Hello', to: 'Xin chào' },
    };
    
    return examples[language] || { from: 'Hello', to: 'Hello' };
}

export default defineEventHandler(async (event) => {
    try {
        const { text, apiKey, ai, model, targetLanguage } = await readBody(event);

        // 参数验证
        if (!text || !Array.isArray(text)) {
            return {
                error: 'Invalid input: text must be a non-empty array',
                code: 400,
            };
        }

        if (!apiKey) {
            return {
                error: 'API key is required',
                code: 400,
            };
        }

        if (!aiUrlOptions[ai]) {
            return {
                error: `Unsupported AI provider: ${ai}`,
                code: 400,
            };
        }

        if (!targetLanguage) {
            return {
                error: 'Target language is required',
                code: 400,
            };
        }

        const openai = new OpenAI({
            baseURL: aiUrlOptions[ai],
            apiKey: apiKey,
        });

        // 获取语言示例
        const langExample = getLanguageExample(targetLanguage);

        const completion = await openai.chat.completions.create({
            model: model,
            temperature: 0.3,
            messages: [
                {
                    role: 'system',
                    content: `You are a professional translation API. Your ONLY task is to translate text to ${targetLanguage}.

CRITICAL TRANSLATION RULES:
1. You MUST translate ALL text to ${targetLanguage}, not English or any other language
2. Return ONLY a valid JSON array with the translations in ${targetLanguage}
3. NO markdown formatting (no \`\`\`json or \`\`\`)
4. NO explanatory text before or after the JSON
5. Preserve all special characters and placeholders like {{0}}, {{1}}, {variable}, etc.
6. Keep the exact same array structure and length as input
7. Do NOT translate technical terms, code, variables, or placeholder names
8. Maintain original formatting (line breaks, spaces, punctuation style)

EXAMPLES OF CORRECT TRANSLATION:
- Input in English: "Hello" → Output in ${targetLanguage}: "${langExample.to}"
- Input: "Welcome {{0}}" → Output: "[${targetLanguage} translation of Welcome] {{0}}"
- Input: "{username}" → Output: "[${targetLanguage} translation] {username}"

Your response MUST:
- Start with [ and end with ]
- Contain ONLY ${targetLanguage} text (except for preserved placeholders)
- Match the input array length exactly

WRONG EXAMPLES (DO NOT DO THIS):
❌ Translating to English when ${targetLanguage} is requested
❌ Keeping original English text unchanged
❌ Adding markdown formatting
❌ Changing placeholder format`
                },
                {
                    role: 'user',
                    content: JSON.stringify(["Hello, '{{0}}'!", "Confirm", "Settings"])
                },
                {
                    role: 'assistant',
                    content: targetLanguage === 'Japanese' 
                        ? JSON.stringify(["こんにちは、'{{0}}'！", "確認", "設定"])
                        : targetLanguage === 'Simplified Chinese'
                        ? JSON.stringify(["你好，'{{0}}'！", "确认", "设置"])
                        : targetLanguage === 'Korean'
                        ? JSON.stringify(["안녕하세요, '{{0}}'!", "확인", "설정"])
                        : JSON.stringify([`${langExample.to}, '{{0}}'!`, "Confirm", "Settings"])
                },
                {
                    role: 'user',
                    content: JSON.stringify(text)
                },
            ],
        });

        let rawContent = completion.choices[0]?.message?.content;
        
        if (!rawContent) {
            return {
                error: 'Empty response from AI',
                code: 500,
            };
        }

        const cleanedContent = cleanJsonResponse(rawContent);

        let messageContent;
        try {
            messageContent = JSON.parse(cleanedContent);
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            console.error('Raw content:', rawContent);
            console.error('Cleaned content:', cleanedContent);
            
            return {
                error: 'Failed to parse AI response as JSON',
                details: parseError.message,
                rawResponse: rawContent,
                code: 500,
            };
        }

        const validation = validateTranslation(text, messageContent);
        if (!validation.valid) {
            console.error('Validation Error:', validation.error);
            return {
                error: 'Translation validation failed',
                details: validation.error,
                original: text,
                translated: messageContent,
                code: 500,
            };
        }

        // 返回成功结果
        return {
            message: messageContent,
            code: 200,
            metadata: {
                model: completion.model,
                usage: completion.usage,
            }
        };

    } catch (error) {
        console.error('Error in translation API:', error);
        
        if (error.status === 401) {
            return {
                error: 'Invalid API key',
                code: 401,
            };
        }
        
        if (error.status === 429) {
            return {
                error: 'Rate limit exceeded',
                code: 429,
            };
        }

        return {
            error: 'Internal server error',
            details: error.message,
            code: 500,
        };
    }
});
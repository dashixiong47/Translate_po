import { po } from 'gettext-parser';

export default defineEventHandler(async (event) => {
    // 读取上传的文件
    const files = await readMultipartFormData(event);
    let allTranslations = [];

    // 处理每个文件
    for (const file of files) {
        const data = file.data.toString('utf-8');
        const parsedTranslations = po.parse(data);
        const { translations } = parsedTranslations;
        let list = [];
        let index = 0;

        // 遍历翻译内容
        for (const key in translations) {
            if (key === '') continue;
            for (const key2 in translations[key]) {
                list.push({
                    index: index,
                    context: key,
                    msgid: key2,
                    msgstr: translations[key][key2].msgstr[0] || ''
                });
            }
            index++;
        }
        allTranslations.push({
            fileName: file.filename,
            translations: list
        });
    }

    // 返回所有翻译内容
    return {
        allTranslations: allTranslations
    };
});
import { po } from 'gettext-parser';

export default defineEventHandler(async (event) => {
    const files = await readMultipartFormData(event);
    const poFile = files[0];
    const poFileData = poFile.data.toString('utf-8');
    const parsedPoFile = po.parse(poFileData);
    const jsonFile = files[1];
    const jsonFileData = jsonFile.data.toString('utf-8');
    const translations = JSON.parse(jsonFileData);

    for (const context in parsedPoFile.translations) {
        for (const key in parsedPoFile.translations[context]) {
            const entry = parsedPoFile.translations[context][key];
            if (translations[entry.msgctxt]) {
                entry.msgstr = translations[entry.msgctxt];
            }
        }
    }

    const compiledPoFile = po.compile(parsedPoFile);
    // 返回合并后的 .po 文件
    event.node.res.setHeader('Content-Disposition', 'attachment; filename="translations.po"');
    event.node.res.setHeader('Content-Type', 'text/plain');
    event.node.res.end(compiledPoFile);
});
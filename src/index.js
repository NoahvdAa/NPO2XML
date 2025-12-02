import express from 'express';
import XMLWriter from 'xml-writer';

import channels from './channels.json' with { type: 'json' };

const app = express();

const formatTime = (date, onlyDate = false) => {
    const pad = (num, size) => String(num).padStart(size, '0');
    const dateString = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1, 2)}${pad(date.getUTCDate(), 2)}`;

    if (onlyDate) return dateString;
    return `${dateString}${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCSeconds(), 2)} +0000`;
};

app.get('/', async (req, res) => {
    // todo error handling
    let daysAhead = Math.min(Math.max(req.query.daysAhead ? parseInt(req.query.daysAhead) : 0, 0), 7);

    let writer = new XMLWriter();
    writer.startDocument();
    writer.writeDocType('tv', null, 'xmltv.dtd');
    writer.startElement('tv');
    writer.writeAttribute('generator-info-url', 'https://github.com/NoahvdAa/NPO2XML');
    writer.writeAttribute('generator-info-name', 'NPO2XML');
    writer.writeAttribute('source-info-url', 'https://npo.nl/start/live');
    writer.writeAttribute('source-info-name', 'NPO');
    for (let channel of channels) {
        writer.startElement('channel');
        writer.writeAttribute('id', channel.externalId);

        writer.startElement('display-name');
        writer.writeAttribute('lang', 'nl');
        writer.text(channel.title);
        writer.endElement();
        writer.startElement('icon');
        writer.writeAttribute('src', channel.logo);
        writer.endElement();

        writer.endElement();

        let seen = [];
        for (let i = 0; i < daysAhead + 1; i++) {
            let date = new Date();
            date.setDate(date.getDate() + i);
            let dateString = `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
            let programsResp = await fetch(`https://npo.nl/start/api/domain/guide-channel?date=${dateString}&guid=${channel.guid}`, {
                headers: {
                    'User-Agent': 'NPO2XML (https://github.com/NoahvdAa/NPO2XML)'
                }
            });
            let programs = await programsResp.json();
            for (let program of programs) {
                if (seen.includes(program.guid)) continue;
                if (program.isFiller) continue; // todo do these programs actually do anything?
                if (program.mainTitle) continue; // NPO site describes these as 'Geen titel bekend'

                let startDate = new Date(program.programStart * 1000);

                writer.startElement('programme');
                writer.writeAttribute('start', formatTime(startDate));
                writer.writeAttribute('stop', formatTime(new Date(program.programEnd * 1000)))
                writer.writeAttribute('channel', channel.externalId);

                writer.startElement('title');
                writer.writeAttribute('lang', 'nl');
                writer.text(program.mainTitle);
                writer.endElement();
                if (program.synopsis) {
                    writer.startElement('desc');
                    writer.writeAttribute('lang', 'nl');
                    writer.text(program.synopsis);
                    writer.endElement();
                }
                writer.startElement('date');
                writer.text(formatTime(startDate, true));
                writer.endElement();

                let pushCategory = (cat) => {
                    writer.startElement('category');
                    writer.writeAttribute('lang', 'nl');
                    writer.text(cat);
                    writer.endElement();
                };
                if (program.isLive) pushCategory('Live');
                if (program.isRepeat) pushCategory('Herhaling');
                for (let genre of program.genres) {
                    pushCategory(genre.name);
                    for (let subgenre of genre.secondaries) {
                        pushCategory(subgenre.name);
                    }
                }
                for (let image of program.images) {
                    if (image.role !== 'default') continue;
                    writer.startElement('icon');
                    writer.writeAttribute('src', image.url);
                    writer.endElement();
                }

                writer.endElement();
                seen.push(program.guid);
            }
        }
    }

    res.type('application/xml');
    res.send(writer.toString());
});

app.listen(3000, () => {
    console.log('Server is running on :3000');
});

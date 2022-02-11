const fs = require('fs-extra');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const corpusPath = path.resolve(__dirname + '/' + process.argv.pop());

const padLeft = (value, length = 2) =>
  value.toString().padStart(length, '0')

function formatTimestamp(
  timestamp,
  options = { format: 'SRT' }
) {
  const date = new Date(0, 0, 0, 0, 0, 0, timestamp)

  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = date.getSeconds()
  const ms = Math.floor(
    timestamp - (hours * 3600000 + minutes * 60000 + seconds * 1000)
  )

  return `${padLeft(hours)}:${padLeft(minutes)}:${padLeft(seconds)}${
    options.format === 'WebVTT' ? '.' : ','
  }${padLeft(ms, 3)}`
}

let corpus;
console.log('corpus path', corpusPath)
try {
  corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf-8').trim());
} catch(e) {
  console.log('invalid corpus file');
}
const compositions = Object.values(corpus.compositions);
console.log('%s compositions to process', compositions.length);

compositions.reduce((cur, composition) => {
  return cur.then(() => new Promise((resolve, reject) => {
    console.log('montage for composition : %s', composition.metadata.title);
    const playlist = composition.summary.filter(element => element.blockType === 'chunk')
    .map(({content, activeFieldId, ...rest}) => {
      const chunk = corpus.chunks[content];
      if (chunk) {
        const {start, end, metadata: {mediaId}, fields} = chunk;
        const strContent = fields[activeFieldId];
        const media = corpus.medias[mediaId].metadata.mediaUrl.split('file://').pop();
        return {
          start,
          end,
          content: strContent,
          id: content,
          media
        }
      }
    })
    .filter(c => c);
    fs.ensureDir(`output/${composition.metadata.title}/chunks`)
    .then(() => {
      console.log('writing subtitles file');
      const output = `output/${composition.metadata.title}/${composition.metadata.title}.srt`;
      const {subtitles: subs} = playlist.reduce(({subtitles, displacement}, chunk) => {
        const duration = chunk.end - chunk.start;
        return {
          displacement: displacement + duration,
          subtitles: [
            ...subtitles,
            {
              start: parseInt(displacement * 1000),
              end: parseInt((duration + displacement) * 1000),
              text: chunk.content
            }
          ]
        }
      }, {
        subtitles: [],
        displacement: 0
      });
      const srt = subs.reduce((str, sub, index) => {
        return `${str}
${index + 1}
${formatTimestamp(sub.start)} --> ${formatTimestamp(sub.end)}
${sub.text}
`
      }, '').trim();
      return fs.writeFile(output, srt, 'utf8')
    })
    .then(() => fs.ensureDir(`output/${composition.metadata.title}/tmp/`))
    .then(() => {
      console.log('converting chunks :: starting');
      return playlist.reduce((cur1, {start, end, content, media, id}, chunkIndex) => cur1.then(() => new Promise((res1, rej1) => {
        console.log('converting chunk %s/%s', chunkIndex + 1, playlist.length);
        ffmpeg(media)
        .setStartTime(start)
        .setDuration(end - start)
        .output(`output/${composition.metadata.title}/chunks/${id}.mp4`)
        .on('end', function(err) {
          console.log('done converting chunk %s/%s', chunkIndex + 1, playlist.length)
          if(!err) { 
            console.log('conversion successful') ;
            res1()
          } else rej1(err);
        })
        .on('progress', function(progress) {
          console.log(chunkIndex + 1 + '/' + playlist.length + ' : ' + progress.percent.toFixed(2) + '% done');
        })
        .on('error', function(err){
          console.log('error: ', err);
          rej1(err);
        })
        .run();
      })), Promise.resolve())
    })
    .then(() => {
      console.log('merging chunks');
      return new Promise((res1, rej1) => {
        const mergedVideo = playlist.reduce((fn, {id}) => {
          fn.input(`output/${composition.metadata.title}/chunks/${id}.mp4`);
          return fn;
        }, ffmpeg())

        mergedVideo
        .mergeToFile(`output/${composition.metadata.title}/${composition.metadata.title}.mp4`, `output/${composition.metadata.title}/tmp/`)
        .on('end', function(err) {
          console.log('done merging')
          if(!err) { 
            console.log('merging successful') ;
            res1()
          } else rej1(err);
        })
        .on('progress', function(progress) {
          console.log('Merging: ' + progress.percent.toFixed(2) + '% done');
        })
        .on('error', function(err){
          console.log('error: ', err);
          rej1(err);
        })
        .run();
      })
    })
    // cleaning stuff
    .then(() => {
      console.log('removing stuff');
      return fs.remove(`output/${composition.metadata.title}/chunks`)
    })
    // cleaning stuff
    .then(() => {
      return fs.remove(`output/${composition.metadata.title}/tmp`)
    })
    .then(() => {
      console.log('all done, bye !!')
      return resolve();
    })
    .catch(console.log)
  }))
}, Promise.resolve())
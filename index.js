'use strict';

let request = require('request');
let fs = require('fs');
let uuid = require('node-uuid');

// 引入缓存模块
let BufferCache = require('./bufferCache');
const chunkSplice = 2097152; // 2MB
let bufferCache = new BufferCache(chunkSplice);

let isFinished = false;

function getChunks(url, onStartDownload, onDownloading, onDownloadClose) {
    'use strict';

    let totalLength = 0;

    let httpStream = request({
        method: 'GET',
        url: url
    });
    // 由于不需要获取最终的文件，所以直接丢掉
    let writeStream = fs.createWriteStream('/dev/null');

    // 联接Readable和Writable
    httpStream.pipe(writeStream);

    httpStream.on('response', (response) => {
        onStartDownload(response.headers);
    }).on('data', (chunk) => {
        totalLength += chunk.length;
        onDownloading(chunk, totalLength);
    });

    writeStream.on('close', () => {
        onDownloadClose(totalLength);
    });
}

function upload(url, data) {
    return new Promise((resolve, reject) => {
        request.post({
            url: url,
            formData: data
        }, function (err, response, body) {
            if (!err && response.statusCode === 200) {
                resolve(body);
            }
            else {
                reject(err);
            }
        });
    });
}

function sendChunks() {
    let chunkId = 0;
    let isSending = false;

    function send(readyCache) {
        if (readyCache.length === 0) {
            return;
        }

        let chunk = readyCache.shift();

        let sendP = upload('http://localhost:3000', {
            chunk: {
                value: chunk,
                options: {
                    filename: 'example.mp4_IDSPLIT_' + chunkId
                }
            }
        });

        isSending = true;
        sendP.then((response) => {
            isSending = false;
            if (response.errno === 0 && readyCache.length > 0) {
                send(readyCache);
            }
        });

        chunkId++;
    }

    return new Promise((resolve, reject) => {
        let readyCache = bufferCache.getChunks();

        let sendTimer = setInterval(() => {
            let readyCache = bufferCache.getChunks();

            if (isFinished && readyCache.length === 0) {
                clearTimeout(sendTimer);
                let lastChunk = bufferCache.getRemainChunks();
                readyCache.push(lastChunk);
                send(readyCache);
            }
            else if (!isSending && readyCache.length > 0) {
                send(readyCache);
            }
            // not ready, wait for next interval
        }, 200);
    });
}

function onStart(headers) {
    // console.log('start downloading, headers is :', headers);

    sendChunks();
}

function onData(chunk, downloadedLength) {
    // console.log('write ' + chunk.length + 'KB into cache');
    // 都写入缓存中 
    bufferCache.pushBuf(chunk);
}

function onFinished(totalLength) {
    let chunkCount = Math.ceil(totalLength / chunkSplice);
    console.log('total chunk count is:' + chunkCount);
    isFinished = true;
}

getChunks('https://baobao-3d.bj.bcebos.com/16-0-205.shuimian.mp4', onStart, onData, onFinished);
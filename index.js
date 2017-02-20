'use strict';

let request = require('request');
let fs = require('fs');
let uuid = require('node-uuid');
let crypto = require('crypto');

// 引入缓存模块
let BufferCache = require('./bufferCache');
const chunkSplice = 2097152; // 2MB
const RETRY_COUNT = 3;

function getMd5(buffer) {
    let md5 = crypto.createHash('md5');
    md5.update(buffer);
    return md5.digest('hex');
}

module.exports = function (url, uploadURL, filename) {
    let bufferCache = new BufferCache(chunkSplice);
    let isFinished = false;

    function getChunks(options, onStartDownload, onDownloading, onDownloadClose) {
        return new Promise((resolve, reject) => {
            'use strict';

            let totalLength = 0;

            let httpStream = request({
                method: 'GET',
                url: options.url
            });
            // 由于不需要获取最终的文件，所以直接丢掉
            // 内存版Stream有最大限制才1Mb，非常容易写爆
            let writeStream = fs.createWriteStream('/dev/null');

            // 联接Readable和Writable
            httpStream.pipe(writeStream);

            httpStream.on('response', (response) => {
                onStartDownload({
                    headers: response.headers,
                    filename: options.filename,
                    onUploadFinished: (err) => {
                        if (err) {
                            reject(err);
                        }
                        resolve();
                    }
                });
            }).on('data', (chunk) => {
                totalLength += chunk.length;
                onDownloading(chunk, totalLength);
            });

            writeStream.on('close', () => {
                onDownloadClose(totalLength);
            });
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

    function sendChunks(_opt) {
        let chunkId = 0;
        let isSending = false;
        let stopSend = false;

        function send(options) {
            let readyCache = options.readyCache;
            let fresh = options.fresh;
            let retryCount = options.retry;
            let chunkIndex;

            let chunk = null;

            // 新的数据
            if (fresh) {
                if (readyCache.length === 0) {
                    return Promise.resolve();
                }

                chunk = readyCache.shift();
                chunkIndex = chunkId;
                chunkId++;
            }
            else {
                chunk = options.data;
                chunkIndex = options.index;
            }

            console.log(`chunkIndex: ${chunkIndex}, buffer:${getMd5(chunk)}`);
            isSending = true;
            return upload(uploadURL, {
                chunk: {
                    value: chunk,
                    options: {
                        filename: `${_opt.filename}_IDSPLIT_` + chunkIndex
                    }
                }
            }).then((response) => {
                isSending = false;
                let json = JSON.parse(response);

                if (json.errno === 0 && readyCache.length > 0) {
                    return send({
                        retry: RETRY_COUNT,
                        fresh: true,
                        readyCache: readyCache
                    });
                }

                return Promise.resolve(json);
            }).catch(err => {
                if (retryCount > 0) {
                    return send({
                        retry: retryCount - 1,
                        index: chunkIndex,
                        fresh: false,
                        data: chunk,
                        readyCache: readyCache
                    });
                }
                else {
                    console.log(`upload failed of chunkIndex: ${chunkIndex}`);
                    stopSend = true;
                    return Promise.reject(err);
                }
            });
        }

        return new Promise((resolve, reject) => {
            let readyCache = bufferCache.getChunks();
            let threadPool = [];

            let sendTimer = setInterval(() => {
                if (!isSending && readyCache.length > 0) {
                    // for (let i = 0; i < 4; i++) {
                        let thread = send({
                            retry: RETRY_COUNT,
                            fresh: true,
                            readyCache: readyCache
                        });

                        threadPool.push(thread);
                    // }
                }
                else if ((isFinished && readyCache.length === 0) || stopSend) {
                    clearTimeout(sendTimer);

                    if (!stopSend) {
                        console.log('got last chunk');
                        let lastChunk = bufferCache.getRemainChunks();
                        readyCache.push(lastChunk);
                        threadPool.push(send({
                            retry: RETRY_COUNT,
                            fresh: true,
                            readyCache: readyCache
                        }));
                    }

                    Promise.all(threadPool).then(() => {
                        console.log('send success');
                        resolve();
                    }).catch(err => {
                        console.log('send failed');
                        reject(err);
                    });
                }
                // not ready, wait for next interval
            }, 200);
        });
    }

    function onStart(options) {
        let headers = options.headers;
        let filename = options.filename;
        let onUploadFinished = options.onUploadFinished;

        // console.log('start downloading, headers is :', headers);
        sendChunks({
            filename: filename
        }).then(() => {
            onUploadFinished();
        }).catch(err => {
            onUploadFinished(err);
        });
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

    return getChunks({
        url: url,
        filename: filename
    }, onStart, onData, onFinished);
}
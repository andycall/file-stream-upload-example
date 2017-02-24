let getChunks = require('./index');
let request = require('request');
let fs = require('fs');
let Promise = require('bluebird');
let path = require('path');
let assert = require('assert');
let BufferCache = require('./bufferCache');

const uploadURL = 'http://localhost:3000/upload';
const getMD5URL = 'http://localhost:3000/md5';

let exampleData = [
    {
        url: 'http://gedftnj8mkvfefuaefm.exp.bcevod.com/mda-hbtp8s8gch6xv2zb/mda-hbtp8s8gch6xv2zb.mp4',
        md5: '1dfa3fe9bab054a8e15821f830027ef7'
    },
    {
        url: 'http://gedftnj8mkvfefuaefm.exp.bcevod.com/mda-hbtpfpkqivd6muq6/mda-hbtpfpkqivd6muq6.mp4?bcevod_channel=searchbox_feed&auth_key=1492702311-0-0-a62de94daed3350d6ac4a8b85e6491e1',
        md5: 'ef88a44d111d0978f61f42ea76dfd71b'
    },
    {
        url: 'http://gedftnj8mkvfefuaefm.exp.bcevod.com/mda-hauzmd37jyphdxad/mda-hauzmd37jyphdxad.mp4?bcevod_channel=searchbox_feed&auth_key=1492702321-0-0-c374f1e645454ec9f11d351e92f65e7e',
        md5: 'ad2176c322d65def3b19450bc358c7dd'
    },
    {
        url: 'http://gedftnj8mkvfefuaefm.exp.bcevod.com/mda-gmjz7ynfb9g2zj7f/mda-gmjz7ynfb9g2zj7f.mp4?bcevod_channel=searchbox_feed&auth_key=1492702329-0-0-718209eba73d4ffd003d94a7415480c5',
        md5: 'ac765793fd360b2dfb389202cc28b635'
    },
    {
        url: 'http://gedftnj8mkvfefuaefm.exp.bcevod.com/mda-hazk5y6e0r1aff5e/mda-hazk5y6e0r1aff5e.mp4',
        md5: 'cf3d06c6a06c4b1dbe7a3906991c56c6'
    }
]

function getData(url, data) {
    return new Promise((resolve, reject) => {
        request({
            url: url,
            method: 'POST',
            form: data
        }, function (err, response, data) {
            if (!err && response.statusCode === 200) {
                resolve(data);
            }
            else {
                reject(data);
            }
        });
    });
}

describe('文件下载测试', () => {
    it('bufferCache simple Test', (done) => {
        console.log('start memory Usage', process.memoryUsage());

        let bufferCache = new BufferCache(2, 1024 * 1024);

        let chunk1 = Buffer.from('aaaa');
        let chunk2 = Buffer.from('b');
        let chunk3 = Buffer.from('ccccccc');
        let chunk4 = Buffer.from('d');

        bufferCache.pushBuf(chunk1);
        bufferCache.pushBuf(chunk2);
        bufferCache.pushBuf(chunk3);
        bufferCache.pushBuf(chunk4);

        let result = [
            'aa',
            'aa',
            'bc',
            'cc',
            'cc',
            'cc'
        ];

        result.forEach((str, index) => {
            assert.equal(str, bufferCache.readyCache[index].toString());
        });

        assert.equal('d', bufferCache.getRemainChunks().toString());

        console.log('test finishe memoryUsage', process.memoryUsage());
        
        chunk1 = null;
        chunk2 = null;
        chunk3 = null;
        chunk4 = null;
        bufferCache.drain();
        bufferCache = null;

        setTimeout(() => {
            console.log('released bufferCache memoryUsage', process.memoryUsage());
            done();
        }, 500);
    });

    it('bufferCache BenchMark Test', function (done) {
        let bufferCache = new BufferCache(1024 * 10);

        var startTime = Date.now();
        var originalBuffer = [];
        let compiledBuffer = [];
        let isFinished = false;

        let pushTimer = setInterval(() => {
            var randomString = [];

            for (let i = 0; i < 1024; i ++) {
                let arr = [];
                for (let j = 0; j < 1024; j ++) {
                    arr.push(j % 10);
                }
                randomString.push(arr.join(''));
            }

            let buffer = Buffer.from(randomString.join(''));
            let bufferCopy = Buffer.alloc(buffer.length);

            buffer.copy(bufferCopy);
            originalBuffer.push(bufferCopy);
            bufferCache.pushBuf(buffer);

            if (Date.now() - startTime > 1000) {
                isFinished = true;
                clearTimeout(pushTimer);
            }
        }, 5);

        let outputTimer = setInterval(() => {
            let readyCache = bufferCache.getChunks();

            while (readyCache.length > 0) {
                let chunk = readyCache.shift();
                compiledBuffer.push(chunk);
            }

            if (isFinished) {
                let lastChunk = bufferCache.getRemainChunks();
                compiledBuffer.push(lastChunk);
                clearTimeout(outputTimer);

                let originBuf = originalBuffer.reduce((total, next) => {
                    return Buffer.concat([total, next], total.length + next.length);
                }, Buffer.alloc(0));
                let compiledBuf = compiledBuffer.reduce((total, next) => {
                    return Buffer.concat([total, next], total.length + next.length);
                }, Buffer.alloc(0));

                assert.equal(originBuf.length, compiledBuf.length);
                assert.equal(originBuf.compare(compiledBuf), 0);

                done();
            }
        }, 10);
    });

    it('upload test', function(done) {
        Promise.map(exampleData, (item, index) => {
            let md5 = item.md5;
            let url = item.url;
            return getChunks(url, uploadURL, md5);
        }).then(() => {
            done();
        }).catch(err => {
            done(err);
        });
    });

    it('download data md5sum test', (done) => {
        Promise.each(exampleData, (item, index) => {
            let md5 = item.md5;
            let url = item.url;

            return getData(getMD5URL, {
                filename: md5
            }).then((serverResponse) => {
                serverResponse = JSON.parse(serverResponse);
                let serverMd5 = serverResponse.data;
                assert.equal(serverMd5, md5);
            });
        }).then(() => {
            done();
        }).catch(err => {
            done(err);
        })
    });
});
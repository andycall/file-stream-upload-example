/**
 * @file 视频下载缓冲区
 */

class BufferCache {
    constructor (cutSize = 2097152) {
        this._cache = Buffer.alloc(0);
        this.cutSize = cutSize;
        this.readyCache = []; // 缓冲区
    }

  	// 放入不同大小的buffer
    pushBuf (buf) {
        let cacheLength = this._cache.length;
        let bufLength = buf.length;

        this._cache = Buffer.concat([this._cache, buf], cacheLength + bufLength);

        this.cut();
    }

    /**
     * 切分分片,小分片拼成大分片，超大分片切成小分片
     */
    cut () {
        if (this._cache.length >= this.cutSize) {
            let totalLen = this._cache.length;
            let cutCount = Math.floor(totalLen / this.cutSize);

            for (let i = 0; i < cutCount; i++) {
                let newBuf = this._cache.slice(i * this.cutSize, (i + 1) * this.cutSize);
                this.readyCache.push(newBuf);
            }
 
            this._cache = this._cache.slice(cutCount * this.cutSize);
        }
    }

    /**
     * 获取等长的分片
     * @returns {Array}
     */
    getChunks () {
        return this.readyCache;
    }

    /**
     * 获取数据包的最后一小节
     * @returns {*}
     */
    getRemainChunks () {
        if (this._cache.length < this.cutSize) {
            return this._cache;
        }
        else {
            this.cut();
            return this.getRemainChunks();
        }
    }
}

module.exports = BufferCache;
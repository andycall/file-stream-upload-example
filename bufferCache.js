/**
 * @file 视频下载缓冲区
 */

class BufferCache {
    constructor (cutSize = 2097152, MAX_BUFFER = 1024 * 1024 * 1024 * 1.5) {
        this._cache = Buffer.allocUnsafe(MAX_BUFFER);
        this.cutSize = cutSize;
        this.canSize = 0; // 容器大小， 会一直涨到cutSize， 然后再减去 cutSize
        this.cutPoint = 0; // 容量指针
        this.readyCacheCount = 0;
        this.readyCache = []; // 缓冲区
    }

  	// 放入不同大小的buffer
    pushBuf (buf) {
        let bufLength = buf.length;

        this._cache.fill(buf, this.cutPoint, this.cutPoint + bufLength);
        
        this.cutPoint += bufLength;
        this.canSize += bufLength;

        this.cut();
    }

    /**
     * 切分分片,小分片拼成大分片，超大分片切成小分片
     */
    cut () {
        if (this.canSize >= this.cutSize) {
            let cutCount = Math.floor(this.canSize / this.cutSize);

            for (let i = 0; i < cutCount; i++) {
                let newBuf = this._cache.slice((this.readyCacheCount) * this.cutSize, (this.readyCacheCount + 1) * this.cutSize);
                this.readyCacheCount++;
                this.readyCache.push(newBuf);
            }
 
            this.canSize = this.canSize - (cutCount * this.cutSize);
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
        if (this.canSize <= this.cutSize) {
            return this._cache.slice(this.readyCacheCount * this.cutSize, this.cutPoint);
        }
        else {
            this.cut();
            return this.getRemainChunks();
        }
    }

    drain() {
        // 消除引用，过段时间GC的大刀就会来临
        this._cache = null;
        this.readyCache = null;
        delete this.canSize;
        delete this.cutPoint;
        delete this.cutSize;
        delete this.readyCacheCount;
    }
}

module.exports = BufferCache;
import * as d3 from "d3";

/**
 * @class
 * HistogramData representing data for the histogram view
 */
export default class HistogramData {
	/**
	 * @param {data} data
	 * @param {Object} options
	 */
	constructor(data, options) {
		this._histogramData = this._loadHistogramData(data, options.width);
		this._minMax = this._calculateMinMax(this._histogramData);
		this._options = options;
	}

	/**
	 * @public
	 * Returns min max of history data
	 * @returns {Object} minMax
	 * @returns {Number} minMax.min
	 * @returns {Number} minMax.max
	 */
	getMinMax() {
		return this._minMax;
	}

	/**
	 * @public
	 * Returns histogram data
	 * @returns {Array} histogram data
	 */
	getData() {
		return this._histogramData;
	}

	/**
	* @private
	* Returns min max values for given histogramData
	* @param {Array} histogramData
	* @returns {Object} minMax.min
	* @returns {Object} minMax.max
	*/
	_calculateMinMax(histogramData) {
		var min = d3.min(histogramData, function (d) { return d.value; });
		var max = d3.max(histogramData, function (d) { return d.value; });

		return {
			min: min,
			max: max
		}
	}

	/**
	 * @public
	* Returns value ratio between bars and data
	* @return {Number} value ratio 
	*/
	getValueRatio() {
		var range = this._minMax.max - this._minMax.min;
		return range / this._options.width;
	}

	/**
	 * @public
	 * Returns data value from given position 
	 * @param {Number} position
	 */
	positionToValue(position) {
		var minMax = this.getMinMax();
		// return min if position is 0
		if (position === 0){
			return minMax.min;
		}

		// return max if position is at the end
		if (position === this._options.width){
			return minMax.max;
		}

		// else calculate based on value ratio and min/max
		var valueRatio = this.getValueRatio();
		return position * valueRatio + minMax.min;
	}

	/**
	 * @public
	 * Returns position from given data value 
	 * @param {Number} value
	 */
	valueToPosition(value) {
		var valueRatio = this.getValueRatio();
		var minMax = this.getMinMax();
		var constrainedValue = Math.min(Math.max(value, minMax.min), minMax.max);
		
		return Math.round(constrainedValue / valueRatio - minMax.min / valueRatio);
	}

	/** 
	* @private
	* @param {Array} buckets
	* @param {int} numOfBarsPerBucket - number of bars per column\
	* @returns {Array} data from given buckets 
	*/
	_loadHistogramData(data, width) {
		var histogramData = [];
		// calculate number of bars per bucket excluding last pixel for max value
		var numOfBarsPerBucket = (width-1) / data.length;

		data.forEach((bucket, i) => {
			var step = (bucket.max - bucket.min) / numOfBarsPerBucket;
			// support array as well as single values
			const volume = Array.isArray(bucket.volume)?bucket.volume:[bucket.volume];

			d3.range(bucket.min, bucket.max, step).forEach((value) => {
				histogramData.push({
					value: value,
					volume: volume
				});
			});

			// adding max value pixel as each non-last bucket ends one pixel before next bucket starts
			if (i == data.length-1){
				histogramData.push({
					value: bucket.max,
					volume: volume
				});
			}
		});

		return histogramData;
	}
}
import style from "../Histogram.css";
import HistogramHandle from "./HistogramHandle";
import Observable from "../../utils/Observable";
import * as PositionUtils from "../utils/PositionUtils"
import * as d3 from "d3";

/**
 * @class
 * Histogram renderer class
 * @param {Object} options
 */
export default class HistogramSelectionRenderer {
    constructor(options) {
		/**
		 * @private 
		 * Histogram options
		 */
		this._options = options;

		/**
		 * @private 
		 * Main group element of this widget
		 */
		this._groupEl = null;

		/**
		 * @private
		 * Bar data 
		 */
		this._histogramData = null;

		/**
		 * @private
		 * history selection
		 */
		this._histogramSelection = null;

		/**
		 * @private
		 * index of over selection  
		 */
		this._overSelectionIndex = null;

		/**
		 * @private
		 * true if histogram has been rendered
		 */
		this._rendered = false;

		/**
		 * @private
		 * selection handles
		 */
		this._handles = [];		

		/**
		 * @private
		 * true if handle is dragged
		 */
		this._draggingHandle = false;		

		/**
		 * @private
		 * stores previous selection for animation
		 */
		this._prevSelection = null;

		/**
		 * @private
		 * true if histogram has been rendered
		 */
		this._rendered = false;

		/**
		 * @private
		 * true if animation is run
		 */
		this._animating = false;


		/**
		 * @private
		 * observable handler
		 */
		this._observable = new Observable([
			/**
			 * @event 
			 * Fires when mouse is over a category
			 * @param {int} selectionIndex
			 */
			"selectionOver",
			/**
			 * @event 
			 * Fires when selection is toggled
			 * @param {int} selectionIndex
			 * @param {bool} enabled
			 */
			"toggleSelection",
			/**
			 * @event 
			 * Fires when selection is changed
			 * @param {int} selectionIndex
			 * @param {bool} enabled
			 */
			"selectionChanged",
			/**
			 * @event 
			 * Fires when user clicks on a handle
			 * @param {int} handleIndex
			 * @param {Number} handleValue
			 */
			"handleClick"
		]);		
    }

	/**
	 * @public
	 * Returns whether histogram has been rendered or not
	 * @returns {boolean} true if histogram has been rendered
	 */
	isRendered(){
		return this._rendered;
	}

	/**
	 * @public
	 * @param {DOMElement}  
	 * @returns {HistogramSelectionRenderer} returns this widget instance
	 */
	render(groupEl){
		this._rendered = true;
		this._groupEl = groupEl

		return this;
	} 	

	/**
	 * @public
	 * Bind handle event
	 * @param {String} event event name
	 * @param {Function} handler event handler
	 * @returns {HistogramHandle} returns this handle instance
	 */
	on(eventName, handler) {
		this._observable.on(eventName, handler);
		return this;
	}	 

	/**
	 * @private
	 * Clears selection controls and data 
	 */
	_clear(){
		this._destroyHandles();
		if (this._selectionBarGroups){
			this._selectionBarGroups.remove();
		}
	}

	/**
	 * @private
	 * Destroys selection controls 
	 */
	_destroyHandles(){
		this._handles.forEach(handle=>handle.destroy());
		this._handles = [];
	}

	/**
	 * @private
	 * Handles click on handle
	 * @param {Number} handleIndex
	 * @param {Number} handleValue 
	 */
	_onHandleClick(handleIndex, handleValue){
		// call prompt handler if available
		if (this._options.promptHandler){
			this._options.promptHandler(handleValue).then((promptResult)=>{
				var startSelectionSnapshot = JSON.stringify(this._histogramSelection.getOutputSelection());
				promptResult = parseFloat(promptResult);
				// must be within min max range
				var minMax = this._histogramData.getMinMax();
				promptResult = Math.min(minMax.max, promptResult);
				promptResult = Math.max(minMax.min, promptResult);

				var points = this._histogramSelection.getSelectionPoints();
				points[handleIndex] = {
					value:promptResult
				};

				var positions = points
					.sort((p1,p2)=>p1.value-p2.value)
					.map(point=>this._histogramData.valueToPosition(point.value));
				
				this._updateSelectionPositions(positions, points);
				this._updateSelection();

				// TODO: update handles without destroying them
				this._destroyHandles();
				this._renderHandles();

				// fire selection change if selection is changed
				if (JSON.stringify(this._options.selection) != startSelectionSnapshot){
					this._observable.fire("selectionChanged", this._histogramSelection.getOutputSelection());
				}
			})
		}

		this._observable.fire("handleClick", handleIndex, handleValue);
	}

	/**
	 * @private
	 * Toggles selection
	 * @param {Number} selectionIndex 
	 */
	_toggleSelection(selectionIndex){
		var selection = this._options.selection[selectionIndex];
		selection.disabled = !selection.disabled;
		var enabled = !selection.disabled;
		this._updateSelection();
		this._observable.fire("toggleSelection", selectionIndex, enabled);
	}	

	/**
	 * @private
	 * Handles click on chart
	 */
	_onClick(){
		var target = d3.select(d3.event.target);
		var selectionIndex = target.attr("data-selection-index");
		var handleIndex = target.attr("data-handle-index");

		if (selectionIndex != null && this._histogramSelection.allowsToggle()){
			this._toggleSelection(selectionIndex)
		} else if (handleIndex != null){
			this._onHandleClick(handleIndex, target.attr("data-handle-value"));
		}
	}
	/**
	 * @private
	 * Handles handle click 
	 */
	_handleClick(){
		this._groupEl.on("click", this._onClick.bind(this));
	}

	/**
	 * @private
	 * Refreshes histogram data 
	 * @param {HistogramData}
	 * @param {HistogramSelection}
	 * @param {Object} options
	 */
	refresh(histogramData, histogramSelection, options){
		this._animate = options && options.animate;
		if (this._animate && this._histogramSelection && this._histogramSelection.getSelection().length == histogramSelection.getSelection().length){
			this._prevSelection = this._histogramSelection.getSelection();
			this._prevHistogramData = this._histogramSelection.getSelection();
		}

		if (this._animate && this._histogramData){
			this._prevHistogramData = this._histogramData;
		}

		this._histogramData = histogramData;
		this._histogramSelection = histogramSelection;
		
		this._clear();
		this._renderSelection();
		this._updateSelection();

		this._handleHoverState();
		this._handleClick();

		return this;
	}

	setSelection(histogramSelection, options){
		if (this.needRefresh(this._histogramSelection, histogramSelection)) {
			return this.refresh(this._histogramData, histogramSelection, options);
		}
		this._histogramSelection = histogramSelection;
		this._updateSelection();
		return this;
	}

	needRefresh(prevHistogramSelection, histogramSelection) {
		if (!prevHistogramSelection || !histogramSelection) {
			return true;
		}
		const prev = prevHistogramSelection.getSelection();
		const curr = histogramSelection.getSelection();
		return (
			!prev || !curr ||
			prev.length !== curr.length ||
			curr.reduce((acc, sel, i) => sel.from === prev[i].from && sel.to === prev[i].to ? acc : true, false)
		);
	}

	/**
	 * @private
	 * Updates selection controls on hover
	 * @param {Number} selectionIndex 
	 */
	_updateSelectionControlsHoverState(selectionIndex){
		// get all handles sorted by X position
		var handles = this._handles.slice().sort((h1,h2)=>{
			return h1.getXPosition() - h2.getXPosition();
		});

		// unset hover state on all handles
		handles.forEach(handle=>handle.unsetHoverState());

		// selection is active, active both handles for active selection
		if (selectionIndex != null){
			var handle1 = handles[selectionIndex];
			var handle2 = handles[selectionIndex+1];

			handle1.setHoverState();
			handle2.setHoverState();

			var labelOffsets = PositionUtils.getHandlePositionOffsets(handle1, handle2, this._options.fontSize, this._options.width);

			handle1.setLabelOffset(labelOffsets[0]);
			handle2.setLabelOffset(labelOffsets[1]);
		}
	}	

	/**
	 * 
	 * @private 
	 * Handles what happens when mouse is over selection
	 * @param {String} type 
	 * @param {Number} i 
	 * @param {HTMLElement[]} array 
	 */
	_onSelectionMouseOver(d, i, nodes){
		// prevent selection when dragging handles
		if (this._draggingHandle){
			return;
		}

		d3.select(nodes[i]).attr("fill", "rgba(0,0,0,0.00)")
		var selectionIndex = parseInt(d3.select(d3.event.target).attr("data-selection-index"));
		if (this._overSelectionIndex != selectionIndex){
			this._overSelectionIndex = selectionIndex;
			this._updateSelection();
			this._updateSelectionControlsHoverState(selectionIndex);
			this._observable.fire("selectionOver", this._overSelectionIndex);
		}
	}

	/**
	 * 
	 * @private 
	 * Handles what happens when mouse is out of selection
	 * @param {String} type 
	 * @param {Number} i 
	 * @param {HTMLElement[]} array 
	 */
	_onSelectionMouseOut(d, i, nodes){
		// prevent selection when dragging handles
		if (this._draggingHandle){
			return;
		}
		d3.select(nodes[i]).attr("fill", "rgba(0,0,0,0)")

		this._overSelectionIndex = null;
		this._updateSelectionControlsHoverState(null);
		this._updateSelection();
		this._observable.fire("selectionOver", this._overSelectionIndex);
		
	}

	/**
	 * @private 
	 * Handles hover state
	 */
	_handleHoverState(){
		var g = this._groupEl;
        g.selectAll("."+style.selectionbargroup).on("mouseout", this._onSelectionMouseOut.bind(this));
        g.selectAll("."+style.selectionbargroup).on("mouseover", this._onSelectionMouseOver.bind(this));
	}

	/**
	 * @private 
	 * Handles when handle is dragged
	 */
	_onHandleDrag(){
		var positions = this._handles.map(handle=>handle.getXPosition()).sort((p1, p2)=>{
			return p1-p2;
		});

		this._updateSelectionPositions(positions);
		this._updateSelection();
	}

	/**
	* @private
	* Updates selection with new positions
	* @param {Array} positions
	* @param {Array} points
	*/
	_updateSelectionPositions(positions, points){
		var selection = this._histogramSelection.getSelection();
		positions.forEach((p, index)=>{
			if (index>selection.length-1){
				return;
			}

			var position = {
				from:p,
				to:positions[index+1]
			};

			var value = {
				from:points?points[index].value:this._histogramData.positionToValue(position.from),
				to:points?points[index+1].value:this._histogramData.positionToValue(position.to),
			};

			["from", "to"].forEach(pos=>{
				const selectionChanged = points?
					// if new points are given, we need to compare selection values
					selection[index][pos] !== value[pos]:
					// otherwise, we need to compare selection position
					selection[index]["position"][pos] !== position[pos];

				// update selection on change
				if (selectionChanged){
					selection[index][pos] = value[pos];	
					selection[index]["position"][pos] = position[pos];
				}
			});
		});
	}	

	/**
	* @private
	* Renders selection bars
	*/
	_renderSelection() {
		var height = this._options.height;
		var selection = this._histogramSelection.getSelection();

		// hover selection bars
		this._selectionBarGroups = this._groupEl.selectAll("."+style.selectionbargroup)
			.data([...selection].reverse()) // reverse because left icons needs to be in foreground
			.enter().append("g")
			.attr("class", style.selectionbargroup)
			.attr("y", 0)
			.attr("height", height);

		this._selectionBarsIcons = this._selectionBarGroups.append("image")
			.attr("class", style.selectionbaricon)
			.attr("xlink:href", function(d) {
				return d.icon ? d.icon.src : null;
			});

		this._selectionBars = this._selectionBarGroups.append("rect")
			.attr("class", style.selectionbar)
			.attr("y", 0)
			.attr("fill", "rgba(0,0,0,0.00)")
			.attr("height", height);
		this._renderHandles();
	}

	/**
	* @private
	* Renders selection controls
	*/
	_renderHandles(){
		// render selection controls
		this._handles = this._histogramSelection.getSelectionPoints().map((point, index)=>{
			var value = point.value;

			var handle = new HistogramHandle(this._groupEl, value, index, this._histogramData, this._options);

			if(point.hidden){
				handle.hide();
			}

			handle.on("drag", ()=>{
				this._onHandleDrag();
			}, this);

			var startSelectionSnapshot;

			// disable other handles when draggin starts
			handle.on("startDrag", ()=>{
				startSelectionSnapshot = JSON.stringify(this._options.selection);
				
				this._draggingHandle = true;
				this._handles.forEach(handle=>handle.disable());
				handle.enable();
			}, this);

			// enable all handles when draggin starts
			handle.on("endDrag", ()=>{
				this._draggingHandle = false;
				this._handles.forEach(handle=>handle.enable());

				if (JSON.stringify(this._options.selection) != startSelectionSnapshot){
					this._observable.fire("selectionChanged", this._histogramSelection.getOutputSelection());
				}
			}, this);
		
		
			return handle;
		});
	}

	/**
	* @private
	* Returns bar color based on X position

	* @param {Number} barX
	* @param {Array} selection
	* @returns {Number} bar category index
	* @param {HistogramData} histogram data 
	*/
	_getBarSelectionIndex(barX, selection, data){
		for (var i=0;i<selection.length;i++){
			var s = selection[i];
			var isLast = i == selection.length-1;
			var within = barX >= data.valueToPosition(s.from) && (barX < data.valueToPosition(s.to) || (isLast && barX <= data.valueToPosition(s.to)));
			if (within) return i;
		}

		return null;
	}	

	/**
	 * @private
	 * Returns selection color
	 * @param {Object} selection
	 * @param {Object} d datum
	 */
	_getSelectionColor(selection, d){
		if (selection.colors){
			return selection.colors[d.volumeIndex];
		}

		if (selection.color){
			return selection.color
		}

		return this._options.selectionColor;
	}

	/**
	 * @private
	 * Returns bar color for given bar position with given selection
	 * @param {Number} barX 
	 * @param {Array} selection 
	 * @param {HistogramData} histogram data 
	 */
	_getBarColor (barX, selection, data, d){
		var inactiveBarColor = this._options.inactiveBarColor;
		var overSelectionColor = this._options.overSelectionColor;
        var segmentDivider = this._options.segmentDivider;

		var barSelectionIndex = this._getBarSelectionIndex(barX, selection, data);
		if (barSelectionIndex == null){
			return inactiveBarColor;
		} else if (segmentDivider && selection.some(sel => (barX === sel.position.to || barX === sel.position.from) && !sel.disabled)) {
			return segmentDivider;
		} else if (selection[barSelectionIndex].disabled){
			return inactiveBarColor;
		} else if (this._histogramSelection.allowsToggle() && this._overSelectionIndex == barSelectionIndex){
			return overSelectionColor;
		} else {
			return this._getSelectionColor(selection[barSelectionIndex], d);
		}
	}

	/**
	 * @private
	 * Returns bar color for given bar position with given selection
	 * @param {Number} barX 
	 * @param {Array} selection 
	 * @param {HistogramData} histogram data 
	 */
	_getBarOpacity (barX, selection, data){
		var defaultOpacity = 1;

		var barSelectionIndex = this._getBarSelectionIndex(barX, selection, data);
		var isOver = this._histogramSelection.allowsToggle() && this._overSelectionIndex == barSelectionIndex;
		var isDisabled = barSelectionIndex != null && selection[barSelectionIndex].disabled;

		if (isOver){
			return this._options.overSelectionOpacity;
		}

		if (isDisabled){
			return this._options.inactiveBarOpacity;
		}
		
		// otherwise use set opacity if 
		if (barSelectionIndex != null && selection[barSelectionIndex].opacity != null){
			return selection[barSelectionIndex].opacity;
		} 

		return defaultOpacity;
	}	

	/**
	 * Runs onTransition as a transition between two selections
	 * @param {Array} selection1 
	 * @param {Array} selection2 
	 * @param {Function} onTransition handler
	 */
	_onSelectionTransition(selection1, selection2, data1, data2, onTransition, onComplete){
		selection1.forEach((s1,selectionIndex)=>{
			var s2 = selection2[selectionIndex];
			var width = this._options.width;
			if (selection1[selectionIndex]){
				var transitions = [];
				var frames = [];

				transitions.push([Math.round(data1.valueToPosition(s1.from)), Math.round(data2.valueToPosition(s2.from))]);
				transitions.push([Math.round(data1.valueToPosition(s1.to)), Math.round(data2.valueToPosition(s2.to))]);

				// make sure duration is calculated based on transition length
				frames = [Math.abs((transitions[0][0] - transitions[0][1])/width), Math.abs((transitions[1][0] - transitions[1][1])/width)];

				transitions.forEach((t, handleIndex)=>{
					var duration = 0;

					while(t[0] !== t[1]){
						setTimeout(onTransition.bind(this, t[0], selectionIndex, handleIndex), duration);
						
						duration = duration+0.5/frames[handleIndex];
						t[0] = t[0]>t[1]?t[0]-1:t[0]+1;
					}

					// call final complete fn only if duration is > 0, this prevents premature animation end
					// when one of the sides is in the same position
					if (duration>0){
						setTimeout(function(p, si, hi){
							onTransition(p, si, hi)
							onComplete(p, si, hi);
						}.bind(this, t[1], selectionIndex, handleIndex), ++duration);
					}
				});
			}
		});
	}

	/**
	* @private
	* Updates selection
	*/
	_updateSelection(){
		var selection = this._histogramSelection.getSelection();
		var bars = this._groupEl.selectAll("."+style.bar);

		// fills bars with given selection
		var fillBars = (s, data) => {
			// handle bar colors
			bars.attr("fill", (d)=> {
				var barX = this._histogramData.valueToPosition(d.value);
				return this._getBarColor(barX, s, data, d);
			})

			// handle bar opacity
			bars.attr("fill-opacity", (d)=> {
				var barX = this._histogramData.valueToPosition(d.value);
				return this._getBarOpacity(barX, s, data, d);
			})
		}

		// handle animation if previous selection is set
		if (this._animate && this._prevSelection){
			var prevSelection = this._prevSelection;
			var prevData = this._prevHistogramData;
			
			// set prev selection
			fillBars(prevSelection, this._prevHistogramData);

			// set handle positions to prev selection
			prevSelection.forEach((s, i)=>{
				var p1 = this._prevHistogramData.valueToPosition(s.from);
				var p2 = this._prevHistogramData.valueToPosition(s.to);

				this._handles[i].setHandleXPosition(p1).setLabelPosition(p1);
				this._handles[i+1].setHandleXPosition(p2).setLabelPosition(p2)
			});

			this._animating = true;
			//fill bars on selection transition and move handles
			this._onSelectionTransition(prevSelection, selection, prevData, this._histogramData, 
				// on transition callback
				(p, selectionIndex, handleIndex)=>{
					var bar = d3.select(bars.nodes()[p]);
					bar.attr("fill", d=>{
						return this._getBarColor(p, selection, this._histogramData, d);
					});

					//var handleText = this._options.format(this._histogramData.positionToValue(p));
					// move handles
					[this._handles[selectionIndex], this._handles[selectionIndex+1]][handleIndex].setHandleXPosition(p).setLabelPosition(p)

				// on complete callback		
			},()=>{
					// hide handles
					//[this._handles[selectionIndex], this._handles[selectionIndex+1]][handleIndex].hideLabel();
					fillBars(selection, this._histogramData)
					this._animating = false;
				}
			);

			this._prevSelection = null;
			this._prevHistogramData = null;
		
		} else {
			fillBars(selection, this._histogramData)
		}
		
		// selection rects
		this._selectionBarGroups
            .data([...selection].reverse()) // reverse because left icons needs to be in foreground
			.attr("transform", (d) => {
				return `translate(${this._histogramData.valueToPosition(d.from)}, 0)`;
			})
			.attr("width", (d) => {
				return this._histogramData.valueToPosition(d.to) - this._histogramData.valueToPosition(d.from);
			});

        this._selectionBarsIcons
            .data([...selection].reverse()) // reverse because left icons needs to be in foreground
            .attr("data-selection-index", function(d,i){
                return selection.length - i - 1;
            })
            .attr("visibility", (d) => d.disabled ? "hidden" : "visible")
            .attr("x", (d) => {
                return (this._histogramData.valueToPosition(d.to) - this._histogramData.valueToPosition(d.from))/2;
            })
            .attr("y", (d) => {
                return d.icon && d.icon.align === "bottom" ? 3*this._options.height/4 : this._options.height/2;
            })
            .attr("transform", (d) => {
                if (!d.icon) {
                    return null;
                }
                const y = d.icon.align === "bottom" ? -d.icon.height : -d.icon.height/2;
                return `translate(${-this.selectionIconWidth(d)/2},${y})`
            })
            .attr("width", this.selectionIconWidth.bind(this))
            .attr("height", (d) => {
                return d.icon ? d.icon.height : null;
            });

		this._selectionBars
            .data([...selection].reverse()) // reverse because left icons needs to be in foreground
			.attr("data-selection-index", function(d,i){
				return selection.length - i - 1;
			})
			.attr("fill", "rgba(0,0,0,0.00)")
			.attr("width", (d) => {
				return this._histogramData.valueToPosition(d.to) - this._histogramData.valueToPosition(d.from);
			});
	}

	selectionIconWidth(selection){
		if (!selection.icon) {
			return null;
		} else if (selection.icon.width === "stretch") {
			return this._histogramData.valueToPosition(selection.to) - this._histogramData.valueToPosition(selection.from);
		} else {
			return selection.icon.width
		}
	}

	/**
	 * Shows selection labels
	 */
	showSelectionLabels(){
		// show label without calculating offsets when animating
		if (this._animating) {
			return this._handles.forEach(handle=>handle.showLabel());
		}

		this._histogramSelection.getSelection().forEach((s,i)=>{
			var handle1 = this._handles[i];
			var handle2 = this._handles[i+1];

			var labelOffsets = PositionUtils.getHandlePositionOffsets(handle1, handle2, this._options.fontSize, this._options.width);
			handle1.setLabelOffset(labelOffsets[0]);
			handle2.setLabelOffset(labelOffsets[1]);
		});
		
		this._handles.forEach(handle=>handle.showLabel());
	}

	/**
	 * Hides selection labels
	 */
	hideSelectionLabels(){
		this._handles.forEach(handle=>handle.hideLabel());
	}		

	/**
	 * @public
	 * Destorys histogram UI  
	 */
	destroy() {
		this._observable.destroy();
		this._clear();

		return this;
    }		
}
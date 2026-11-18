// Copyright (c) 2021-2023 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { DisplayComponent, FSComponent, NodeReference, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { HudElems } from './HUDUtils';
import { ArincEventBus } from '@flybywiresim/fbw-sdk';

interface VerticalTapeProps {
  displayRange: number;
  valueSpacing: number;
  distanceSpacing: number;
  tapeValue: Subscribable<number>;
  lowerLimit: number;
  upperLimit: number;
  type: 'altitude' | 'speed';
  bus: ArincEventBus;
}

export class VerticalTape extends DisplayComponent<VerticalTapeProps> {
  private refElement = FSComponent.createRef<SVGGElement>();
  private readonly sub = this.props.bus.getArincSubscriber<HudElems>();
  private tickRefs: NodeReference<SVGGElement>[] = [];
  private crosswindMode = false;

  /** Cached element references per graduation: querying the DOM on every update allocates a live HTMLCollection. */
  private readonly tickElements: { group: SVGGElement; path: SVGPathElement; text: SVGTextElement }[] = [];

  private readonly tickOffsets: number[] = [];

  private readonly tickPathHidden: boolean[] = [];

  private readonly tickTextHidden: boolean[] = [];

  private lastTapeOffset = Number.NaN;
  private buildSpeedGraduationPoints(): NodeReference<SVGGElement>[] {
    const numTicks = Math.round((this.props.displayRange * 2) / this.props.valueSpacing);

    const clampedValue = Math.max(Math.min(this.props.tapeValue.get(), this.props.upperLimit), this.props.lowerLimit);

    let lowestValue = Math.max(
      Math.round((clampedValue - this.props.displayRange) / this.props.valueSpacing) * this.props.valueSpacing,
      this.props.lowerLimit,
    );
    if (lowestValue < this.props.tapeValue.get() - this.props.displayRange) {
      lowestValue += this.props.valueSpacing;
    }

    const graduationPoints = [];

    for (let i = 0; i < numTicks; i++) {
      const elementValue = lowestValue + i * this.props.valueSpacing;
      if (elementValue <= (this.props.upperLimit ?? Infinity)) {
        const offset = (-elementValue * this.props.distanceSpacing) / this.props.valueSpacing;
        const element = { elementValue, offset };
        if (element) {
          let text = '';
          if (elementValue % 20 === 0) {
            text = Math.abs(elementValue).toString().padStart(3, '0');
          }

          const tickRef = FSComponent.createRef<SVGGElement>();
          graduationPoints.push(
            <g ref={tickRef} style={`transform: translate3d(0px, ${offset}px, 0px)`} id="spdVerticalTape">
              <path class="NormalStroke Green" d="m80.882 343.476h-11.988" />
              <text class="FontMedium MiddleAlign Green" x="34" y="352.75">
                {text}
              </text>
            </g>,
          );
          this.tickRefs.push(tickRef);
        }
      }
    }
    return graduationPoints;
  }

  private buildAltitudeGraduationPoints(): NodeReference<SVGGElement>[] {
    const numTicks = Math.round((this.props.displayRange * 2) / this.props.valueSpacing);

    const clampedValue = Math.max(Math.min(this.props.tapeValue.get(), this.props.upperLimit), this.props.lowerLimit);

    let lowestValue = Math.max(
      Math.round((clampedValue - this.props.displayRange) / this.props.valueSpacing) * this.props.valueSpacing,
      this.props.lowerLimit,
    );
    if (lowestValue < this.props.tapeValue.get() - this.props.displayRange) {
      lowestValue += this.props.valueSpacing;
    }

    const graduationPoints = [];

    for (let i = 0; i < numTicks; i++) {
      const elementValue = lowestValue + i * this.props.valueSpacing;
      if (elementValue <= (this.props.upperLimit ?? Infinity)) {
        const offset = (-elementValue * this.props.distanceSpacing) / this.props.valueSpacing;
        const element = { elementValue, offset };
        if (element) {
          let text = '';
          if (elementValue % 500 === 0) {
            text = (Math.abs(elementValue) / 100).toString().padStart(3, '0');
          }
          const tickRef = FSComponent.createRef<SVGGElement>();

          graduationPoints.push(
            <g ref={tickRef} style={`transform: translate3d(0px, ${offset}px, 0px)`}>
              <path class="NormalStroke Green" d="m556.112 343.481h-8.562" />
              <text class="FontMedium MiddleAlign Green" x="524" y="351">
                {text}
              </text>
            </g>,
          );
          this.tickRefs.push(tickRef);
        }
      }
    }
    return graduationPoints;
  }

  onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    // Resolve the path/text elements once instead of walking the subtree on every single update.
    for (const ref of this.tickRefs) {
      const group = ref.instance;
      this.tickElements.push({
        group,
        path: group.getElementsByTagName('path')[0],
        text: group.getElementsByTagName('text')[0],
      });
    }

    this.sub
      .on('cWndMode')
      .whenChanged()
      .handle((value) => {
        this.crosswindMode = value;
      });

    this.props.tapeValue.sub((newValue) => {
      const multiplier = 100;
      const currentValueAtPrecision = Math.round(newValue * multiplier) / multiplier;
      const clampedValue = Math.max(
        Math.min(currentValueAtPrecision, this.props.upperLimit ?? Infinity),
        this.props.lowerLimit ?? -Infinity,
      );

      let lowestValue = Math.max(
        Math.round((clampedValue - this.props.displayRange) / this.props.valueSpacing) * this.props.valueSpacing,
        this.props.lowerLimit,
      );
      if (lowestValue < currentValueAtPrecision - this.props.displayRange) {
        lowestValue += this.props.valueSpacing;
      }

      for (let i = 0; i < this.tickElements.length; i++) {
        const elementValue = lowestValue + i * this.props.valueSpacing;
        if (elementValue > (this.props.upperLimit ?? Infinity)) {
          continue;
        }

        const tick = this.tickElements[i];
        const offset = (-elementValue * this.props.distanceSpacing) / this.props.valueSpacing;

        if (this.tickOffsets[i] !== offset) {
          this.tickOffsets[i] = offset;
          tick.group.style.transform = `translate3d(0px, ${offset}px, 0px)`;
        }

        let text = '';
        let pathHidden = false;
        let textHidden = false;

        if (this.props.type === 'speed') {
          if (elementValue % 20 === 0) {
            text = Math.abs(elementValue).toString().padStart(3, '0');
          }

          pathHidden = newValue < 80 && elementValue > newValue + this.props.displayRange;
          textHidden = pathHidden;
        } else if (this.props.type === 'altitude') {
          if (elementValue % 500 === 0) {
            text = (Math.abs(elementValue) / 100).toString().padStart(3, '0');
          }

          if (this.crosswindMode) {
            textHidden = Math.abs(currentValueAtPrecision - elementValue) > 200;
            pathHidden = textHidden || elementValue % 500 !== 0;
          }
        }

        this.setHidden(tick.path, pathHidden, this.tickPathHidden, i);
        this.setHidden(tick.text, textHidden, this.tickTextHidden, i);

        if (tick.text.textContent !== text) {
          tick.text.textContent = text;
        }
      }

      const tapeOffset = (clampedValue * this.props.distanceSpacing) / this.props.valueSpacing;
      if (this.lastTapeOffset !== tapeOffset) {
        this.lastTapeOffset = tapeOffset;
        this.refElement.instance.style.transform = `translate3d(0px, ${tapeOffset}px, 0px)`;
      }
    }, true);
  }

  private setHidden(element: SVGElement, hidden: boolean, cache: boolean[], index: number): void {
    if (cache[index] === hidden) {
      return;
    }
    cache[index] = hidden;
    element.classList.toggle('HiddenElement', hidden);
  }

  render(): VNode {
    return (
      <g ref={this.refElement}>
        {this.props.type === 'altitude' && this.buildAltitudeGraduationPoints()}
        {this.props.type === 'speed' && this.buildSpeedGraduationPoints()}
        {this.props.children}
      </g>
    );
  }
}

import { Injectable } from "@nestjs/common";
import { Counter, Gauge, Histogram, register, Summary } from "prom-client";

type Labels = Record<string, string | number>;

@Injectable()
export class MetricsService {
  private counters = new Map<string, Counter<string>>();
  private histograms = new Map<string, Histogram<string>>();
  private gauges = new Map<string, Gauge<string>>();
  private summaries = new Map<string, Summary<string>>();
  private labelNames = new Map<string, string>();

  incrementCounter(name: string, help: string, value = 1, labels?: Labels): void {
    const counter = this.getCounter(name, help, labels);
    if (labels) counter.inc(labels, value);
    else counter.inc(value);
  }

  recordHistogram(
    name: string,
    help: string,
    value: number,
    labels?: Labels,
    buckets?: number[],
    exemplarLabels?: Record<string, string>,
  ): void {
    const histogram = this.getHistogram(name, help, labels, buckets);
    if (exemplarLabels && Object.keys(exemplarLabels).length > 0) {
      histogram.observe({ labels: labels ?? {}, value, exemplarLabels });
    } else if (labels) {
      histogram.observe(labels, value);
    } else {
      histogram.observe(value);
    }
  }

  startTimer(name: string, help: string, labels?: Labels, buckets?: number[]): () => number {
    const histogram = this.getHistogram(name, help, labels, buckets);
    return labels ? histogram.startTimer(labels) : histogram.startTimer();
  }

  setGauge(name: string, help: string, value: number, labels?: Labels): void {
    const gauge = this.getGauge(name, help, labels);
    if (labels) gauge.set(labels, value);
    else gauge.set(value);
  }

  incrementGauge(name: string, help: string, value = 1, labels?: Labels): void {
    const gauge = this.getGauge(name, help, labels);
    if (labels) gauge.inc(labels, value);
    else gauge.inc(value);
  }

  decrementGauge(name: string, help: string, value = 1, labels?: Labels): void {
    const gauge = this.getGauge(name, help, labels);
    if (labels) gauge.dec(labels, value);
    else gauge.dec(value);
  }

  recordSummary(name: string, help: string, value: number, labels?: Labels): void {
    const summary = this.getSummary(name, help, labels);
    if (labels) summary.observe(labels, value);
    else summary.observe(value);
  }

  private getCounter(name: string, help: string, labels?: Labels): Counter<string> {
    const labelNames = this.assertLabelNames(name, labels);
    let metric = this.counters.get(name);
    if (!metric) {
      const existing = register?.getSingleMetric?.(name);
      metric = (existing as Counter<string> | undefined) ?? new Counter({ name, help, labelNames });
      this.counters.set(name, metric);
    }
    return metric;
  }

  private getHistogram(
    name: string,
    help: string,
    labels?: Labels,
    buckets?: number[],
  ): Histogram<string> {
    const labelNames = this.assertLabelNames(name, labels);
    let metric = this.histograms.get(name);
    if (!metric) {
      const existing = register?.getSingleMetric?.(name);
      metric =
        (existing as Histogram<string> | undefined) ??
        new Histogram({
          name,
          help,
          labelNames,
          buckets,
          enableExemplars: true,
        });
      this.histograms.set(name, metric);
    }
    return metric;
  }

  private getGauge(name: string, help: string, labels?: Labels): Gauge<string> {
    const labelNames = this.assertLabelNames(name, labels);
    let metric = this.gauges.get(name);
    if (!metric) {
      const existing = register?.getSingleMetric?.(name);
      metric = (existing as Gauge<string> | undefined) ?? new Gauge({ name, help, labelNames });
      this.gauges.set(name, metric);
    }
    return metric;
  }

  private getSummary(name: string, help: string, labels?: Labels): Summary<string> {
    const labelNames = this.assertLabelNames(name, labels);
    let metric = this.summaries.get(name);
    if (!metric) {
      const existing = register?.getSingleMetric?.(name);
      metric = (existing as Summary<string> | undefined) ?? new Summary({ name, help, labelNames });
      this.summaries.set(name, metric);
    }
    return metric;
  }

  private assertLabelNames(name: string, labels?: Labels): string[] {
    const labelNames = Object.keys(labels ?? {})
      .sort()
      .join(",");
    const previous = this.labelNames.get(name);
    if (previous && previous !== labelNames) {
      throw new Error(`Metric ${name} was called with an incompatible label set`);
    }
    this.labelNames.set(name, labelNames);
    return labelNames ? labelNames.split(",") : [];
  }
}

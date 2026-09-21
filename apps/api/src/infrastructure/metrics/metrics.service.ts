import { Injectable } from "@nestjs/common";
import { Counter, Gauge, Histogram, register, Summary } from "prom-client";

type Labels = Record<string, string | number>;
function isCounterMetric(metric: unknown): metric is Counter<string> {
  return (
    metric instanceof Counter ||
    (typeof metric === "object" &&
      metric !== null &&
      (metric as { type?: string }).type === "counter")
  );
}

function isHistogramMetric(metric: unknown): metric is Histogram<string> {
  return (
    metric instanceof Histogram ||
    (typeof metric === "object" &&
      metric !== null &&
      ((metric as { type?: string }).type === "histogram" ||
        (typeof (metric as { observe?: unknown }).observe === "function" &&
          typeof (metric as { startTimer?: unknown }).startTimer === "function")))
  );
}

function isGaugeMetric(metric: unknown): metric is Gauge<string> {
  return (
    metric instanceof Gauge ||
    (typeof metric === "object" &&
      metric !== null &&
      ((metric as { type?: string }).type === "gauge" ||
        (typeof (metric as { set?: unknown }).set === "function" &&
          typeof (metric as { inc?: unknown }).inc === "function" &&
          typeof (metric as { dec?: unknown }).dec === "function")))
  );
}

function isSummaryMetric(metric: unknown): metric is Summary<string> {
  return (
    metric instanceof Summary ||
    (typeof metric === "object" &&
      metric !== null &&
      (metric as { type?: string }).type === "summary")
  );
}

@Injectable()
export class MetricsService {
  private counters = new Map<string, Counter<string>>();
  private histograms = new Map<string, Histogram<string>>();
  private gauges = new Map<string, Gauge<string>>();
  private summaries = new Map<string, Summary<string>>();
  private labelNames = new Map<string, string>();

  incrementCounter(name: string, help: string, value = 1, labels?: Labels): void {
    const counter = this.getCounter(name, help, labels);
    const validValue = Number.isFinite(value) ? value : 1;
    if (labels) counter.inc(labels, validValue);
    else counter.inc(validValue);
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
    const validValue = Number.isFinite(value) ? value : 0;
    const hasExemplars = Boolean((histogram as { enableExemplars?: boolean }).enableExemplars);

    if (hasExemplars) {
      histogram.observe({
        labels: labels ?? {},
        value: validValue,
        ...(exemplarLabels && Object.keys(exemplarLabels).length > 0 ? { exemplarLabels } : {}),
      });
    } else if (labels) {
      histogram.observe(labels, validValue);
    } else {
      histogram.observe(validValue);
    }
  }

  startTimer(name: string, help: string, labels?: Labels, buckets?: number[]): () => number {
    const histogram = this.getHistogram(name, help, labels, buckets);
    return labels ? histogram.startTimer(labels) : histogram.startTimer();
  }

  setGauge(name: string, help: string, value: number, labels?: Labels): void {
    const gauge = this.getGauge(name, help, labels);
    const validValue = Number.isFinite(value) ? value : 0;
    if (labels) gauge.set(labels, validValue);
    else gauge.set(validValue);
  }

  incrementGauge(name: string, help: string, value = 1, labels?: Labels): void {
    const gauge = this.getGauge(name, help, labels);
    const validValue = Number.isFinite(value) ? value : 1;
    if (labels) gauge.inc(labels, validValue);
    else gauge.inc(validValue);
  }

  decrementGauge(name: string, help: string, value = 1, labels?: Labels): void {
    const gauge = this.getGauge(name, help, labels);
    const validValue = Number.isFinite(value) ? value : 1;
    if (labels) gauge.dec(labels, validValue);
    else gauge.dec(validValue);
  }

  recordSummary(name: string, help: string, value: number, labels?: Labels): void {
    const summary = this.getSummary(name, help, labels);
    const validValue = Number.isFinite(value) ? value : 0;
    if (labels) summary.observe(labels, validValue);
    else summary.observe(validValue);
  }

  private getCounter(name: string, help: string, labels?: Labels): Counter<string> {
    const labelNames = this.assertLabelNames(name, labels);
    let metric = this.counters.get(name);
    if (!metric) {
      const existing = register?.getSingleMetric?.(name);
      if (existing) {
        if (!isCounterMetric(existing)) {
          throw new Error(`Metric ${name} is registered but is not a Counter`);
        }
        metric = existing;
      } else {
        metric = new Counter({ name, help, labelNames });
      }
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
      if (existing) {
        if (!isHistogramMetric(existing)) {
          throw new Error(`Metric ${name} is registered but is not a Histogram`);
        }
        metric = existing;
      } else {
        const canEnableExemplars = Boolean(
          (register as { contentType?: string } | undefined)?.contentType?.includes("openmetrics"),
        );
        metric = new Histogram({
          name,
          help,
          labelNames,
          ...(buckets && buckets.length > 0 ? { buckets } : {}),
          ...(canEnableExemplars ? { enableExemplars: true } : {}),
        });
      }
      this.histograms.set(name, metric);
    }
    return metric;
  }

  private getGauge(name: string, help: string, labels?: Labels): Gauge<string> {
    const labelNames = this.assertLabelNames(name, labels);
    let metric = this.gauges.get(name);
    if (!metric) {
      const existing = register?.getSingleMetric?.(name);
      if (existing) {
        if (!isGaugeMetric(existing)) {
          throw new Error(`Metric ${name} is registered but is not a Gauge`);
        }
        metric = existing;
      } else {
        metric = new Gauge({ name, help, labelNames });
      }
      this.gauges.set(name, metric);
    }
    return metric;
  }

  private getSummary(name: string, help: string, labels?: Labels): Summary<string> {
    const labelNames = this.assertLabelNames(name, labels);
    let metric = this.summaries.get(name);
    if (!metric) {
      const existing = register?.getSingleMetric?.(name);
      if (existing) {
        if (!isSummaryMetric(existing)) {
          throw new Error(`Metric ${name} is registered but is not a Summary`);
        }
        metric = existing;
      } else {
        metric = new Summary({ name, help, labelNames });
      }
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

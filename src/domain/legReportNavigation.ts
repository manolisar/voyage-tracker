import type { Leg, Report, ReportKind, SelectionKind, VoyageReport } from '../types/domain';

export type LegReportKind = ReportKind | 'voyageReport';

export interface ReportCompletion {
  complete: boolean;
  label: string;
}

const REPORT_ORDER: LegReportKind[] = ['departure', 'arrival', 'voyageReport'];

function missing(label: string): ReportCompletion {
  return { complete: false, label: `Missing ${label}` };
}

function complete(): ReportCompletion {
  return { complete: true, label: 'Complete' };
}

function hasAnyRob(report: Report): boolean {
  return !!(report.rob?.hfo || report.rob?.mgo || report.rob?.lsfo);
}

function hasNegativeCounter(report: Report): boolean {
  for (const phase of report.phases || []) {
    for (const eq of Object.values(phase.equipment || {})) {
      if (eq.start === '' || eq.end === '' || eq.start == null || eq.end == null) continue;
      const start = parseFloat(String(eq.start));
      const end = parseFloat(String(eq.end));
      if (Number.isFinite(start) && Number.isFinite(end) && end < start) return true;
    }
  }
  return false;
}

function completionForReport(report: Report | null | undefined, kind: ReportKind): ReportCompletion {
  if (!report) return missing(kind === 'departure' ? 'departure report' : 'arrival report');
  if (!report.date) return missing('date');
  if (!report.port) return missing('port');
  if (!report.engineer) return missing('engineer');
  if (!report.timeEvents?.sbe) return missing('SBE');
  if (kind === 'departure' && !report.timeEvents?.fa) return missing('FA');
  if (kind === 'arrival' && !report.timeEvents?.fwe) return missing('FWE');
  if (hasNegativeCounter(report)) return { complete: false, label: 'Negative counter' };
  if (!hasAnyRob(report)) return missing('ROB');
  return complete();
}

function completionForNavReport(voyageReport: VoyageReport | null | undefined): ReportCompletion {
  if (!voyageReport) return missing('nav report');
  if (!voyageReport.voyage?.totalMiles) return missing('total miles');
  if (!voyageReport.voyage?.steamingTime) return missing('steaming time');
  if (!voyageReport.departure?.sbe) return missing('departure SBE');
  if (!voyageReport.departure?.fa) return missing('FA');
  if (!voyageReport.arrival?.sbe) return missing('arrival SBE');
  if (!voyageReport.arrival?.fwe) return missing('FWE');
  return complete();
}

export function getReportCompletion(
  report: Report | VoyageReport | null | undefined,
  kind: LegReportKind,
): ReportCompletion {
  if (kind === 'voyageReport') return completionForNavReport(report as VoyageReport | null | undefined);
  return completionForReport(report as Report | null | undefined, kind);
}

export function getLegReportCompletion(leg: Leg, kind: LegReportKind): ReportCompletion {
  if (kind === 'voyageReport') return getReportCompletion(leg.voyageReport, kind);
  return getReportCompletion(leg[kind], kind);
}

export function getDefaultLegReportKind(leg: Leg): LegReportKind {
  for (const kind of REPORT_ORDER) {
    if (!getLegReportCompletion(leg, kind).complete) return kind;
  }
  return 'departure';
}

export function isLegReportKind(kind: SelectionKind | null | undefined): kind is LegReportKind {
  return kind === 'departure' || kind === 'arrival' || kind === 'voyageReport';
}

export function legReportLabel(kind: LegReportKind): string {
  if (kind === 'departure') return 'Departure';
  if (kind === 'arrival') return 'Arrival';
  return 'Nav Report';
}

export const LEG_REPORT_KINDS: readonly LegReportKind[] = REPORT_ORDER;

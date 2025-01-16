export const getReportCommentIdentifier = (serviceType: string): string => `<!-- service-definition-validator-report-for-${serviceType}-service-type -->`;
export default getReportCommentIdentifier;

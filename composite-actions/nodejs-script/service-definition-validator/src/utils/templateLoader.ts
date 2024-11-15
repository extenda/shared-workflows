import inputApiStaging from "../../templates/input-api/staging.json" with { type: "json" };
import inputApiProduction from "../../templates/input-api/production.json" with { type: "json" };
import statefulProcessorStaging from "../../templates/stateful-processor/staging.json" with { type: "json" };
import statefulProcessorProduction from "../../templates/stateful-processor/production.json" with { type: "json" };
import statelessProcessorStaging from "../../templates/stateless-processor/staging.json" with { type: "json" };
import statelessProcessorProduction from "../../templates/stateless-processor/production.json" with { type: "json" };
import queryApiStaging from "../../templates/query-api/staging.json" with { type: "json" };
import queryApiProduction from "../../templates/query-api/production.json" with { type: "json" };

import type { ServiceType, ServiceTemplates } from "../types";

export const serviceTypeToTemplatesMap: Record<ServiceType, ServiceTemplates> = {
  STATEFUL_PROCESSOR: {
    staging: statefulProcessorStaging,
    production: statefulProcessorProduction,
  },
  STATELESS_PROCESSOR: {
    staging: statelessProcessorStaging,
    production: statelessProcessorProduction,
  },
  QUERY_API: {
    staging: queryApiStaging,
    production: queryApiProduction,
  },
  INPUT_API: {
    staging: inputApiStaging,
    production: inputApiProduction,
  },
};

export default serviceTypeToTemplatesMap;

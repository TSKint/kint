import { z } from "zod";
import { kint } from "../../kint";
import { KintResponse } from "../../../../../src/core/models/KintResponse";

export default kint.defineZodEndpoint(
  {
    urlParams: {
      test: z.string(),
    },
  },
  (req, res, ctx) => {
    return new KintResponse("Does nothing", 200);
  }
);

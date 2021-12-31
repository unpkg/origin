// @ts-expect-error
import SRIToolbox from "sri-toolbox";

export function getIntegrity(data: Buffer): string {
  return SRIToolbox.generate({ algorithms: ["sha384"] }, data);
}

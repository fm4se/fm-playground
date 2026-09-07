package de.buw.fmp.alloy.api;

import java.io.IOException;

public class AlloyInstanceControllerLocal extends AlloyInstanceController {
  @Override
  public String getCodeByPermalink(String type, String permalink) {
    return Specs.valueOf(permalink).code;
  }

  /**
   * Overloaded method to get instance by spec
   *
   * @param spec spec enum value
   * @param index index of instance
   * @return
   * @throws IOException
   */
  public String getInstance(Specs spec, int index) throws IOException {
    return super.getInstance("ALS", spec.name(), index);
  }
}

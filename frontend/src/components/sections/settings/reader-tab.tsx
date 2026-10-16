import { useTranslation } from "react-i18next";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import { SettingGroup, SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import type {
  AppSettings,
  ReaderDirection,
  ReaderFilter,
  ReaderFitMode,
  ReaderSideClickMode,
  ReaderSpreadMode,
} from "@/lib/contracts";

export interface ReaderTabProps {
  form: AppSettings;
  updateField: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function ReaderTab({ form, updateField }: ReaderTabProps) {
  const { t } = useTranslation();

  const spreadOptions: SegmentedOption<ReaderSpreadMode>[] = [
    { value: "auto", label: t("reader.spreadAuto") },
    { value: "single", label: t("reader.spreadSingle") },
    { value: "double", label: t("reader.spreadDouble") },
  ];

  const directionOptions: SegmentedOption<ReaderDirection>[] = [
    { value: "rtl", label: t("reader.directionRTL") },
    { value: "ltr", label: t("reader.directionLTR") },
  ];

  const sideClickOptions: SegmentedOption<ReaderSideClickMode>[] = [
    { value: "right_next", label: t("settings.sideClickRightNextShort") },
    { value: "follow", label: t("settings.sideClickFollowShort") },
    { value: "left_next", label: t("settings.sideClickLeftNextShort") },
  ];

  const fitOptions: SegmentedOption<ReaderFitMode>[] = [
    { value: "contain", label: t("reader.fitContain") },
    { value: "width", label: t("reader.fitWidth") },
    { value: "height", label: t("reader.fitHeight") },
    { value: "original", label: t("reader.fitOriginal") },
  ];

  const filterOptions: SegmentedOption<ReaderFilter>[] = [
    { value: "none", label: t("reader.filterNone") },
    { value: "invert", label: t("reader.filterInvert") },
    { value: "sepia", label: t("reader.filterSepia") },
    { value: "high-contrast", label: t("reader.filterHighContrast") },
  ];

  return (
    <div className="space-y-5">
      <SettingGroup
        title={t("settings.groupLayout")}
        description={t("settings.groupLayoutDesc")}
      >
        <SettingRow
          title={t("reader.spreadMode")}
          description={t("settings.spreadModeHint")}
          control={
            <SegmentedControl
              size="sm"
              value={form.readerSpreadMode || "auto"}
              options={spreadOptions}
              onChange={(val) => updateField("readerSpreadMode", val)}
            />
          }
        />

        <SettingRow
          title={t("reader.direction")}
          description={t("settings.directionHint")}
          control={
            <SegmentedControl
              size="sm"
              value={form.readerDirection || "rtl"}
              options={directionOptions}
              onChange={(val) => updateField("readerDirection", val)}
            />
          }
        />

        <SettingRow
          title={t("reader.sideClickMode")}
          description={
            (form.readerSideClickMode || "right_next") === "follow"
              ? t("settings.sideClickFollowHint")
              : (form.readerSideClickMode || "right_next") === "left_next"
              ? t("settings.sideClickLeftNextHint")
              : t("settings.sideClickRightNextHint")
          }
          control={
            <SegmentedControl
              size="sm"
              value={form.readerSideClickMode || "right_next"}
              options={sideClickOptions}
              onChange={(val) => updateField("readerSideClickMode", val)}
            />
          }
        />

        <SettingRow
          title={t("reader.coverSolo")}
          description={t("settings.coverSoloHint")}
          control={
            <Switch
              checked={form.readerCoverSolo !== false}
              onChange={(checked) => updateField("readerCoverSolo", checked)}
            />
          }
        />
      </SettingGroup>

      <SettingGroup
        title={t("settings.groupDisplay")}
        description={t("settings.groupDisplayDesc")}
      >
        <SettingRow
          title={t("reader.fitMode")}
          description={t("settings.fitModeHint")}
          control={
            <SegmentedControl
              size="sm"
              value={form.readerFitMode || "contain"}
              options={fitOptions}
              onChange={(val) => updateField("readerFitMode", val)}
            />
          }
        />

        <SettingRow
          title={t("reader.filter")}
          description={t("settings.filterHint")}
          control={
            <SegmentedControl
              size="sm"
              value={form.readerFilter || "none"}
              options={filterOptions}
              onChange={(val) => updateField("readerFilter", val)}
            />
          }
        />
      </SettingGroup>

      <SettingGroup
        title={t("settings.groupZoom")}
        description={t("settings.groupZoomDesc")}
      >
        <SettingRow
          title={t("reader.clickCenterZoom")}
          description={t("settings.clickCenterZoomHint")}
          control={
            <Switch
              checked={form.readerClickCenterZoom === true}
              onChange={(checked) =>
                updateField("readerClickCenterZoom", checked)
              }
            />
          }
        />

        <SettingRow
          title={t("reader.doubleClickZoom")}
          description={t("settings.doubleClickZoomHint")}
          control={
            <Switch
              checked={form.readerDoubleClickZoom === true}
              onChange={(checked) =>
                updateField("readerDoubleClickZoom", checked)
              }
            />
          }
        />
      </SettingGroup>
    </div>
  );
}

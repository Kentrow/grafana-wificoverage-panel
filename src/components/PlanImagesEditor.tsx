import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, StandardEditorProps } from '@grafana/data';
import { IconButton, useStyles2 } from '@grafana/ui';
import { formatBytes } from '../utils/planImage';

/** Lists the plans uploaded from the panel; they are too big to show as JSON. */
export const PlanImagesEditor = ({ value, onChange }: StandardEditorProps<Record<string, string> | undefined>) => {
  const styles = useStyles2(getStyles);
  const entries = Object.entries(value ?? {});
  if (entries.length === 0) {
    return (
      <div className={styles.empty}>None. Use Floor plan above the panel, in the panel editor, to upload one.</div>
    );
  }
  return (
    <ul className={styles.list}>
      {entries.map(([floor, url]) => (
        <li key={floor} className={styles.item}>
          <span>{floor || 'This floor'}</span>
          <span className={styles.size}>
            {url.slice(5, url.indexOf(';'))} · {formatBytes(url.length)}
          </span>
          <IconButton
            name="trash-alt"
            tooltip="Remove this plan"
            onClick={() => {
              const { [floor]: _removed, ...rest } = value ?? {};
              onChange(rest);
            }}
          />
        </li>
      ))}
    </ul>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  empty: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  list: css({
    listStyle: 'none',
    margin: 0,
    padding: 0,
  }),
  item: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  }),
  size: css({
    marginLeft: 'auto',
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
});

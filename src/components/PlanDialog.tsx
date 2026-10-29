import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Alert, Button, Checkbox, Field, FileDropzone, Input, Modal, Stack, useStyles2 } from '@grafana/ui';
import {
  formatBytes,
  heightForImage,
  LARGE_PLAN_BYTES,
  loadPlanFile,
  PLAN_ACCEPT,
  PlanImage,
} from '../utils/planImage';
import { MAX_FLOOR_M, MIN_FLOOR_M } from '../model/scene';

export interface PlanChange {
  /** A new image, null to remove the uploaded one, undefined to keep the current plan. */
  image?: PlanImage | null;
  sizeM: [number, number];
}

interface Props {
  sizeM: [number, number];
  hasUploadedPlan: boolean;
  onApply: (change: PlanChange) => void;
  onDismiss: () => void;
}

export const PlanDialog = ({ sizeM, hasUploadedPlan, onApply, onDismiss }: Props) => {
  const styles = useStyles2(getStyles);
  const [image, setImage] = useState<PlanImage | null>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [width, setWidth] = useState(sizeM[0]);
  const [height, setHeight] = useState(sizeM[1]);
  const [keepRatio, setKeepRatio] = useState(true);

  const ratioLocked = Boolean(image) && keepRatio;

  const onFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const loaded = await loadPlanFile(file);
      setImage(loaded);
      setHeight(heightForImage(width, loaded.widthPx, loaded.heightPx));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The image could not be read.');
    } finally {
      setLoading(false);
    }
  };

  const onWidth = (value: number) => {
    setWidth(value);
    if (image && keepRatio) {
      setHeight(heightForImage(value, image.widthPx, image.heightPx));
    }
  };

  const inRange = (v: number) => v >= MIN_FLOOR_M && v <= MAX_FLOOR_M;
  const valid = inRange(width) && inRange(height);

  return (
    <Modal title="Floor plan" isOpen onDismiss={onDismiss}>
      <FileDropzone
        options={{ accept: PLAN_ACCEPT, multiple: false, onDrop: (files) => onFile(files[0]) }}
        fileListRenderer={() => null}
      >
        <div className={styles.drop}>
          {loading
            ? 'Reading the image…'
            : 'Drop an SVG, PNG, JPEG or WebP plan here, or click to choose one. SVG stays sharp and light.'}
        </div>
      </FileDropzone>
      {error && (
        <Alert severity="error" title="This image cannot be used">
          {error}
        </Alert>
      )}
      {image && (
        <div className={styles.preview} data-testid="wifi-plan-preview">
          <img src={image.url} alt="New floor plan" className={styles.image} />
          <div className={styles.info}>
            {image.format} · {Math.round(image.widthPx)} × {Math.round(image.heightPx)} px · {formatBytes(image.bytes)}{' '}
            stored in the dashboard
          </div>
          {image.bytes > LARGE_PLAN_BYTES && (
            <Alert severity="warning" title="Heavy plan">
              The image makes the dashboard heavier to load. Prefer an SVG, a smaller image, or serve it from a URL and
              set the Floor plan URL option instead.
            </Alert>
          )}
        </div>
      )}
      {image === null && <Alert severity="info" title="The uploaded plan will be removed" />}
      <Stack gap={2} alignItems="flex-end">
        <Field label="Width (m)" noMargin>
          <Input
            type="number"
            min={1}
            width={12}
            value={width}
            onChange={(e) => onWidth(e.currentTarget.valueAsNumber)}
            aria-label="Floor width in metres"
          />
        </Field>
        <Field label="Height (m)" noMargin>
          <Input
            type="number"
            min={1}
            width={12}
            value={height}
            disabled={ratioLocked}
            onChange={(e) => setHeight(e.currentTarget.valueAsNumber)}
            aria-label="Floor height in metres"
          />
        </Field>
        {image && (
          <Checkbox
            label="Keep the image proportions"
            value={keepRatio}
            onChange={(e) => {
              setKeepRatio(e.currentTarget.checked);
              if (e.currentTarget.checked) {
                setHeight(heightForImage(width, image.widthPx, image.heightPx));
              }
            }}
          />
        )}
      </Stack>
      {!valid && (
        <Alert severity="warning" title={`The floor size must be between ${MIN_FLOOR_M} and ${MAX_FLOOR_M} m.`} />
      )}
      <div className={styles.note}>
        Walls and AP positions are relative to the plan: they stretch with it when the size changes.
      </div>
      <Modal.ButtonRow
        leftItems={
          hasUploadedPlan && image !== null ? (
            <Button variant="destructive" fill="outline" icon="trash-alt" onClick={() => setImage(null)}>
              Remove uploaded plan
            </Button>
          ) : undefined
        }
      >
        <Button variant="secondary" fill="outline" onClick={onDismiss}>
          Cancel
        </Button>
        <Button disabled={!valid || loading} onClick={() => onApply({ image, sizeM: [width, height] })}>
          Apply
        </Button>
      </Modal.ButtonRow>
    </Modal>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  drop: css({
    padding: theme.spacing(2),
    textAlign: 'center',
    color: theme.colors.text.secondary,
  }),
  preview: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    margin: theme.spacing(2, 0),
  }),
  image: css({
    maxWidth: '100%',
    maxHeight: 180,
    objectFit: 'contain',
    background: theme.colors.background.secondary,
    borderRadius: theme.shape.radius.default,
  }),
  info: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  note: css({
    marginTop: theme.spacing(1),
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
});

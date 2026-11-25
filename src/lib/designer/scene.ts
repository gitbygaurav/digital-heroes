import { z } from "zod";

export const printAreaSchema = z.object({
  id: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().positive(),
  h: z.number().finite().positive(),
  shape: z.enum(["rect", "ellipse", "path"]),
  safeMarginMm: z.number().finite().min(0).default(3),
  pathData: z.string().optional(),
});

export const sceneTextFitSchema = z.object({
  mode: z.enum(["shrink_to_fit", "none"]),
  minPt: z.number().positive(),
  maxPt: z.number().positive(),
  minTracking: z.number().max(0).default(-60),
});

export const sceneTextObjectSchema = z.object({
  type: z.literal("text"),
  id: z.string().min(1),
  placeholderKey: z.string().optional(),
  text: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().positive(),
  h: z.number().finite().positive(),
  rotation: z.number().finite().default(0),
  font: z.string().default("Inter"),
  fontSizePt: z.number().positive(),
  tracking: z.number().finite().default(0),
  fill: z.string().default("#0B0B1A"),
  align: z.enum(["left", "center", "right"]).default("center"),
  fit: sceneTextFitSchema.optional(),
});

export const sceneImageObjectSchema = z.object({
  type: z.literal("image"),
  id: z.string().min(1),
  placeholderKey: z.string().optional(),
  src: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().positive(),
  h: z.number().finite().positive(),
  rotation: z.number().finite().default(0),
});

export const sceneObjectSchema = z.discriminatedUnion("type", [
  sceneTextObjectSchema,
  sceneImageObjectSchema,
]);

export const sceneJsonSchema = z.object({
  version: z.literal(1),
  unit: z.literal("mm"),
  canvas: z.object({
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    bleed: z.number().finite().min(0),
  }),
  printAreas: z.array(printAreaSchema).min(1),
  objects: z.array(sceneObjectSchema),
});

export type PrintAreaSpec = z.infer<typeof printAreaSchema>;
export type SceneTextObject = z.infer<typeof sceneTextObjectSchema>;
export type SceneImageObject = z.infer<typeof sceneImageObjectSchema>;
export type SceneObject = z.infer<typeof sceneObjectSchema>;
export type SceneJson = z.infer<typeof sceneJsonSchema>;

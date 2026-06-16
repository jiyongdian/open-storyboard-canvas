import type { NodeTypes } from '@xyflow/react';

import { AiAudioNode } from './AiAudioNode';
import { AiTextNode } from './AiTextNode';
import { AiVideoNode } from './AiVideoNode';
import { AudioNode } from './AudioNode';
import { BlueprintNode } from './BlueprintNode';
import { GroupNode } from './GroupNode';
import { ImageEditNode } from './ImageEditNode';
import { ImageNode } from './ImageNode';
import { JsonCardNode } from './JsonCardNode';
import { PanoramaNode } from './PanoramaNode';
import { StoryboardGenNode } from './StoryboardGenNode';
import { StoryboardNode } from './StoryboardNode';
import { TextAnnotationNode } from './TextAnnotationNode';
import { UploadNode } from './UploadNode';
import { VideoNode } from './VideoNode';

export const nodeTypes: NodeTypes = {
  aiAudioNode: AiAudioNode,
  aiTextNode: AiTextNode,
  aiVideoNode: AiVideoNode,
  audioNode: AudioNode,
  blueprintNode: BlueprintNode,
  exportImageNode: ImageNode,
  groupNode: GroupNode,
  imageNode: ImageEditNode,
  jsonCardNode: JsonCardNode,
  panoramaNode: PanoramaNode,
  storyboardGenNode: StoryboardGenNode,
  storyboardNode: StoryboardNode,
  textAnnotationNode: TextAnnotationNode,
  uploadNode: UploadNode,
  videoNode: VideoNode,
};

export {
  AiAudioNode,
  AiTextNode,
  AiVideoNode,
  AudioNode,
  BlueprintNode,
  GroupNode,
  ImageEditNode,
  ImageNode,
  JsonCardNode,
  PanoramaNode,
  StoryboardGenNode,
  StoryboardNode,
  TextAnnotationNode,
  UploadNode,
  VideoNode,
};

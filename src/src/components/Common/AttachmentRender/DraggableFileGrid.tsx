import React from 'react';
import { DndContext, closestCenter, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FileType } from '../Editor/type';
import { api } from '@/lib/trpc';

type DraggableFileGridProps = {
  files: FileType[];
  preview?: boolean;
  columns?: number;
  onReorder?: (newFiles: FileType[]) => void;
  type: 'image' | 'other';
  className?: string;
  renderItem?: (file: FileType) => React.ReactNode;
};

const SortableFileItem = ({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: React.ReactNode;
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {children}
    </div>
  );
};

export const DraggableFileGrid = ({
  files,
  preview = false,
  onReorder,
  type,
  className,
  renderItem
}: DraggableFileGridProps) => {
  // Mirrors the previous react-beautiful-dnd `isDraggingOver` highlight: the grid itself is the
  // drop area, so the class applies while a file is dragged over it.
  const { setNodeRef: setGridRef, isOver } = useDroppable({ id: `${type}-attachment-grid` });

  const filteredFiles = files.filter(i => i.previewType === type);
  const itemIds = filteredFiles.map((file, index) => `${file.name}-${index}`);

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over) return;

    const sourceIndex = itemIds.indexOf(String(active.id));
    const destinationIndex = itemIds.indexOf(String(over.id));
    if (sourceIndex === -1 || destinationIndex === -1) return;

    // Reorder only the files of this preview type, then write them back into their original slots —
    // the same mapping the DragDropContext handler performed.
    const reorderedFiles = arrayMove(filteredFiles, sourceIndex, destinationIndex);
    let cursor = 0;
    const newFiles = files.map(file => (file.previewType === type ? reorderedFiles[cursor++] : file));

    onReorder?.(newFiles);

    try {
      await api.notes.updateAttachmentsOrder.mutate({
        attachments: newFiles.map((file, index) => ({
          name: file.name,
          sortOrder: index
        }))
      });
    } catch (error) {
      console.error('Failed to update attachments order:', error);
    }
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={itemIds} strategy={horizontalListSortingStrategy}>
        <div ref={setGridRef} className={`${className} ${isOver ? 'bg-hover/50' : ''}`}>
          {filteredFiles.map((file, index) => (
            <SortableFileItem
              key={`${file.name}-${index}`}
              id={`${file.name}-${index}`}
              disabled={preview}
            >
              {renderItem?.(file)}
            </SortableFileItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

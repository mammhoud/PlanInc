import { IconButton } from '../IconButton';
import { useTranslation } from 'react-i18next';
import { NoteType } from '@shared/lib/types';
import { Div } from '@/components/Common/Div';
import { useEffect, useState } from 'react';

export const NoteTypeButton = ({ noteType, setNoteType}: {
  noteType: NoteType,
  setNoteType: (noteType: NoteType) => void
}) => {
  const { t } = useTranslation();
  const [type, setType] = useState(noteType);

  useEffect(() => {
    setType(noteType);
  }, [noteType]);
  
  const getNextNoteType = (currentType: NoteType) => {
    switch (currentType) {
      case NoteType.PLANINC:
        return NoteType.NOTE;
      case NoteType.NOTE:
        return NoteType.TODO;
      case NoteType.TODO:
        return NoteType.PLANINC;
      default:
        return NoteType.PLANINC;
    }
  };

  const getIconForType = (noteType: NoteType) => {
    switch (noteType) {
      case NoteType.PLANINC:
        return 'basil:lightning-solid';
      case NoteType.NOTE:
        return 'solar:notes-minimalistic-bold-duotone';
      case NoteType.TODO:
        return 'solar:folder-check-bold';
      default:
        return 'basil:lightning-solid';
    }
  };

  const getColorForType = (noteType: NoteType) => {
    switch (noteType) {
      case NoteType.PLANINC:
        return '!text-[#FFD700]';
      case NoteType.NOTE:
        return '!text-[#3B82F6]';
      case NoteType.TODO:
        return '!text-[#10B981]';
      default:
        return '!text-[#FFD700]';
    }
  };

  const getLabelForType = (noteType: NoteType) => {
    switch (noteType) {
      case NoteType.PLANINC:
        return t('type-plan');
      case NoteType.NOTE:
        return t('type-note');
      case NoteType.TODO:
        return t('type-task');
      default:
        return t('type-plan');
    }
  };
  
  return (
    <Div
      className='mr-[-2px]'
      onTap={() => {
        const newType = getNextNoteType(type);
        setType(newType);
        setNoteType(newType);
      }}>
      <IconButton
        icon={getIconForType(type)}
        classNames={{
          icon: getColorForType(type)
        }}
        tooltip={getLabelForType(type)}
      />
    </Div>
  );
}; 
import { useState, KeyboardEvent } from 'react'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}

export function TagInput({ tags, onChange, placeholder = 'Add tag...' }: TagInputProps) {
  const [input, setInput] = useState('')

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const newTag = input.trim().replace(/^#/, '')
      if (newTag && !tags.includes(newTag)) {
        onChange([...tags, newTag])
        setInput('')
      }
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(t => t !== tagToRemove))
  }

  return (
    <div className="tag-input-container">
      <div className="tag-input__list">
        {tags.map(tag => (
          <span key={tag} className="tag tag--editable">
            #{tag}
            <button 
              type="button" 
              className="tag__remove" 
              onClick={() => removeTag(tag)}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          type="text"
          className="tag-input__field"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
        />
      </div>
    </div>
  )
}

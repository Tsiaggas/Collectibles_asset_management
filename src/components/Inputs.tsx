import React from 'react';

export const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input {...props} className={`input ${props.className ?? ''}`} />
);

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
  <textarea {...props} className={`input ${props.className ?? ''}`} />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select {...props} className={`select ${props.className ?? ''}`} />
);

export const Checkbox: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input type="checkbox" {...props} className={`checkbox ${props.className ?? ''}`} />
);



package nativeprotocol

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"reflect"
	"strings"
)

var errSchema = errors.New("invalid native protocol object")

// Decode rejects duplicate/unknown/missing/case-aliased fields, trailing JSON
// and excessive nesting before typed decoding. Native inputs are closed schemas.
func Decode(raw []byte, target any) error {
	t := reflect.TypeOf(target)
	if t == nil || t.Kind() != reflect.Pointer {
		return errSchema
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	if err := uniqueValue(decoder, 0); err != nil {
		return errSchema
	}
	if _, err := decoder.Token(); err != io.EOF {
		return errSchema
	}
	if err := exactFields(raw, t.Elem()); err != nil {
		return err
	}
	decoder = json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return errSchema
	}
	return nil
}

func uniqueValue(d *json.Decoder, depth int) error {
	if depth > 64 {
		return errSchema
	}
	token, err := d.Token()
	if err != nil {
		return err
	}
	delim, container := token.(json.Delim)
	if !container {
		return nil
	}
	switch delim {
	case '{':
		seen := map[string]bool{}
		for d.More() {
			key, err := d.Token()
			if err != nil {
				return err
			}
			name, ok := key.(string)
			if !ok || seen[name] {
				return errSchema
			}
			seen[name] = true
			if err := uniqueValue(d, depth+1); err != nil {
				return err
			}
		}
	case '[':
		for d.More() {
			if err := uniqueValue(d, depth+1); err != nil {
				return err
			}
		}
	default:
		return errSchema
	}
	_, err = d.Token()
	return err
}

func exactFields(raw []byte, t reflect.Type) error {
	if t == reflect.TypeOf(json.RawMessage{}) {
		return nil
	}
	if t.Kind() != reflect.Pointer && bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return errSchema
	}
	if t.Kind() == reflect.Pointer {
		if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return nil
		}
		return exactFields(raw, t.Elem())
	}
	if t.Kind() != reflect.Struct {
		return nil
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		return errSchema
	}
	known := map[string]bool{}
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		tag := strings.Split(f.Tag.Get("json"), ",")
		name := tag[0]
		if name == "" || name == "-" {
			return errSchema
		}
		known[name] = true
		value, exists := fields[name]
		if !exists {
			if len(tag) < 2 || tag[1] != "omitempty" {
				return errSchema
			}
			continue
		}
		if err := exactFields(value, f.Type); err != nil {
			return err
		}
	}
	for key := range fields {
		if !known[key] {
			return errSchema
		}
	}
	return nil
}

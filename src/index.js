#!/usr/bin/env node

const { dirname } = require('path');
const { fileURLToPath } = require('url');
const options = require('./options.js');

const {
	get_files,
	read_files,
	parse_data,
	clean_html,
	add_front_matter,
	warn_missing_reciprocal_links,
	generate_html,
	generate_graph,
	add_title_attributes,
	replace_placeholders,
	add_table_of_contents,
	sort: sortPromise,
	output,
} = require('cross-doc');

(async () => {
	const { sort } = await sortPromise(options);
	process.stderr.write('Getting files....\n');
	const files = await get_files(options);
	process.stderr.write('Reading files....\n');
	const data = await read_files(files);
	process.stderr.write('Parsing data....\n');
	const parsed_data = parse_data(data);
	process.stderr.write('Cleaning HTML....\n');
	const cleaned_data = clean_html(parsed_data);
	process.stderr.write('Adding front matter....\n');
	const enhanced_data = add_front_matter(cleaned_data, options);
	process.stderr.write('Checking links....\n');
	warn_missing_reciprocal_links(enhanced_data, options);
	process.stderr.write('Sorting data....\n');
	const sorted_data = sort(enhanced_data);
	process.stderr.write('Generating HTML....\n');
	const $ = await generate_html(sorted_data, options);
	process.stderr.write('Replacing placeholders....\n');
	replace_placeholders($);
	process.stderr.write('Adding title attributes....\n');
	add_title_attributes($);
	process.stderr.write('Building table of contents....\n');
	await add_table_of_contents($, options);
	process.stderr.write('Generating output....\n');
	// const graph = generate_graph($, sorted_data, options);
	output($, options);
})();

const { Command } = require('commander');
const program = new Command();
const path = require('path');

const defaultProject = process.cwd();

program
	.option('-p, --project <directory>', 'Project directory', defaultProject)
	.option(
		'-b, --base_name <name>',
		'Default name (without extension) for the output files. Default: out/project-directory-name',
		null
	)
	.option('-h, --html_file_name <file>', 'Output HTML file name', null)
	.option(
		'-e, --embedded_html_file_name <file>',
		'Output HTML-with-embedded-data file name Default: out/base_name-complete.html',
		null
	)
	.option('-p, --pdf_file_name <file>', 'Output PDF file name', null)
	.option('-t, --theme <name>', 'Theme name', 'A5')
	.option('-i, --include <items>', 'Comma separated list of items to include (default is everything)', value =>
		value.split(/\s*,\s*/)
	);

program.parse(process.argv);
const options = program.opts();

const baseName = options.base_name || `out/${path.basename(defaultProject)}`;

const opts = {
	baseName,
	project: options.project,
	html_file_name: options.html_file_name || `${options.project}/${baseName}.html`,
	embedded_html_file_name: options.embedded_html_file_name || `${options.project}/${baseName}-complete.html`,
	pdf_file_name: options.pdf_file_name || `${options.project}/${baseName}.pdf`,
	theme: options.theme,
	include: options.include,
};

console.log({ opts });

module.exports = opts;
